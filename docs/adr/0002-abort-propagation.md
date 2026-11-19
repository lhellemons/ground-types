# ADR-0002 — Abort propagates upstream

Date: 2026-08-03. Status: accepted.

## Context

`AbortablePromise` extends `Promise` and adds an `abort()` that rejects
the promise with an `AbortError` if it has not already settled. Every
combinator a consumer already knows — `await`, `then`, `catch`,
`finally`, `Promise.all` — keeps working, because the subclass is a real
`Promise`.

That leaves one question the platform does not answer: when a promise
derived through `then` is aborted, what happens to the promise it was
derived from?

Answering "nothing" is the safe-looking option, and it is close to
useless. `fetchThing().then(parse).abort()` would reject the parsing step
while the fetch it exists to cancel runs to completion, unobserved. The
only way to cancel real work would be to hold a reference to the head of
every chain, which is exactly the bookkeeping an abortable promise is
supposed to remove.

Answering "abort it too" makes cancellation compose, and introduces a
hazard: two chains branched off one source share that source.

## Decision

- **Abort propagates upstream.** Aborting a promise returned by `then`,
  `catch` or `finally` aborts the promise it derived from, transitively
  to the head of the chain. A chain is one abortable unit.

- **The sibling consequence is accepted and documented, not designed
  around.** Given `const a = source.then(f)` and `const b =
source.then(g)`, aborting `a` aborts `source`, which rejects `b`. Linear
  chains are the overwhelmingly common shape; branching off a shared
  abortable source is rare, and now has an escape hatch rather than a
  surprise.

- **`detach()` is that escape hatch.** It returns an `AbortablePromise`
  that settles exactly as its source does but owns its abort lifetime:
  aborting it never touches the source. Abort still travels the other
  way, because a rejected source rejects everything derived from it by
  ordinary promise propagation. One method rather than a detached
  variant of `then`, so `catch` and `finally` need no detached variants
  of their own — the link is severed once, at the branch point, and
  everything chained after it inherits the severance.

  It is implemented as `super.then()`, which bypasses this class's `then`
  override and therefore constructs the derived promise through the
  species constructor with a controller of its own.

- **Linked controllers, not one shared controller.** A shared controller
  would make `signal.aborted` consistent across a whole chain, which is
  the one thing the linked design does not give. It was rejected because
  there is no seam to inject it: `Promise.prototype.then` constructs the
  derived promise via `Symbol.species` with exactly one argument, so the
  `controller` parameter always takes its default. Getting a shared
  controller in requires either routing through `peer()` and hand-rolling
  resolution — where calling `.then()` on the result of `super.then()`
  re-enters the override and recurses without bound — or stashing each
  instance's own `reject` in a private field so a derived promise can
  re-register it against an adopted controller. Neither is a
  simplification, and a shared controller would additionally mean that
  `abortOn` on any link binds the entire chain.

- **Fan-in propagates too, and the losers of a race do not.** `all`,
  `allSettled`, `race` and `any` are overridden so that aborting the
  combined promise aborts every member that can be aborted. Inherited,
  they returned an `AbortablePromise` whose `abort()` typechecked, ran,
  and left every member going — an abort that silently does nothing,
  which is worse than one that is absent. Two sub-rulings:

  - Members that are plain `Promise`s are skipped rather than being an
    error. A combinator over a mix of both is ordinary, and there is
    simply nothing on a plain promise to abort.
  - A member settling first does **not** abort the others, in `race` or
    anywhere else. Settling first says the result is no longer needed; it
    does not say the remaining work should be cancelled. Cancelling work
    that may have side effects, on the caller's behalf and without being
    asked, is not a combinator's decision to make.

  Each override delegates to its inherited implementation and declares
  `Promise`'s own overload pair — the tuple form that keeps each member's
  type in position, and the iterable form for a homogeneous collection.
  Declaring only the iterable form made a mixed-type `all` a type error
  rather than a tuple, which is the commonest way these are called.

  Delegating is not free, and this is the one place where the allocation
  budget below is not met. `Promise.all` and friends route every member
  through `this.resolve`, which is our override, so each member costs a
  `Promise.resolve` wrapper, an `AbortablePromise.of` wrapper around that,
  and a derived promise from the `then` override — three promises where a
  plain `Promise.all` allocates one. It buys the inherited combinator
  semantics verbatim, which is worth more than the allocation: hand-rolled
  fan-in is four more places to get abort wrong.

  **Update, 2026-11-15:** a member is recognised by a private-field check and a
  guarded prototype check, not `instanceof`: the value carries the private field
  only this class's constructor sets, and `AbortablePromise.prototype` is on its
  chain (answering false when the walk throws). The combinators abort the
  members of that kind whose `then` is a function on the one read
  `AbortablePromise` makes as it takes the member. A member whose `then` is no
  function was taken as a plain value, and one whose `then` getter throws was
  taken as a member rejected with the getter's error; neither has a handler, so
  aborting it is an unhandled rejection. A `then` function that subscribes
  nothing is not detected and is aborted. The combinators call the member's
  `abort()`, so a subclass's override is honoured, as it is by `then`'s upstream
  link; they check again when the combined promise is aborted, so a member whose
  prototype was swapped since is skipped; and `abort()` is called on every
  member even when one throws, the first error being thrown after the last. A
  Proxy over an `AbortablePromise` is not one, whatever its traps do, and
  neither is a member whose prototype was swapped to one that does not inherit
  `AbortablePromise.prototype`. Reached through a signal that aborts later, the
  error is thrown inside the signal's event listener, which the platform reports
  as an uncaught exception; `abortOn` with a signal that has already aborted
  throws it to the caller of `abortOn`.

  **Update, 2026-11-15:** the combinators iterate `values` lazily, as the native
  ones do, through a generator that takes each member as the native combinator
  asks for it. What `values` throws rejects the combined promise, a member taken
  before that is subscribed to, and the iterator is closed when the combinator
  stops early. A member that is an `AbortablePromise` whose `then` is a function
  has that `then` read once, as it is taken, and the native combinator is handed
  a thenable that calls it: the members aborted are then the ones whose `then`
  is that function, and a subclass's static `resolve` receives the thenable, not
  the member. A member whose `then` is no function on that read is handed over
  as it is and is not aborted, also when a getter returns a function on
  `Promise`'s own read of it. The link to the members is registered once
  `values` has been iterated. When the combined promise was aborted while it was
  being made, whether while `values` was iterated or by a subclass constructor,
  the link is registered after the abort and fires at once, for every member
  taken, including those taken after the abort; a throw from a member's
  `abort()` there is dropped, as it is for a delegate, since the combined
  promise is aborted already.

- **Resolving with a promise is not settling.** The abort window closes
  when the promise actually settles, not when its executor calls
  `resolve`. Counting resolution as settlement made `abort()` a silent
  no-op for `new AbortablePromise((resolve) => resolve(work()))` — the
  delegating shape the class exists for, and the one an aborting caller is
  most likely to be holding. A resolution that is handed a thenable is
  therefore adopted and claims settlement only when that thenable settles;
  a resolution handed a plain value still settles at once, so aborting
  after it remains the documented no-op.

  **Update, 2026-11-15:** adopting is a resolution, though, and a promise is
  resolved once: the `resolve` and `reject` an executor receives share one flag,
  as a native promise's do, and every call after the first is ignored, whether
  the thenable handed to the first is still pending or has settled. While it is
  pending only `abort()` still acts on the promise. An executor that throws goes
  through the same `reject`, so a throw after `resolve(work)` is ignored too. A
  `resolve` called after the promise was aborted hands over a delegate for the
  first call only: a later call is ignored, whether the first handed over a
  delegate or not. A promise resolved with itself rejects with a `TypeError`.

- **Delegation is upstream, so abort travels it.** Keeping the abort
  window open is only half of that ruling. The other half is where the
  abort goes: aborting the outer promise in
  `new AbortablePromise((resolve) => resolve(work()))` also aborts
  `work()` when `work()` returned an `AbortablePromise`. Rejecting only
  the outer promise would leave the delegate running, uncancelled and
  unobserved — the same failure the upstream ruling above rejects for
  `then`, arrived at by a different route, and worse here because the
  delegate is precisely the work the wrapper exists to hold.

  This is the sibling hazard again, and it gets the same answer rather
  than a second one: the delegate is shared if the executor shares it,
  and `resolve(work().detach())` hands over the outcome without handing
  over the right to cancel. One escape hatch, used at the delegation
  instead of at the branch.

  Two sub-rulings follow from the mechanism:

  - A delegate that is a plain `Promise` is left alone, exactly as a
    plain member of a fan-in is. There is nothing on it to abort.
  - A link registered after the abort already happened fires at once,
    rather than being queued for an abort that is in the past. An
    executor may call `resolve` at any time, including long after its
    promise was aborted, and the delegate it hands over then is only
    reached because late links still fire. `AbortState.link` owns that
    rule so every caller of it — the `then` override and the fan-in
    combinators included — gets it.

  The rejection this causes in the delegate is handled: the adoption is
  started before the upstream link to it is registered. A delegate whose
  `then` is the `Promise.prototype.then` captured at load has its handlers
  attached at once; any other has a job queued that calls its `then`, which
  runs before a rejection is reported as unhandled, also for a link that
  fires at once because the `resolve` came after the abort. A delegate whose
  own `then` subscribes nothing stays unhandled. A test pins that.

  **Update, 2026-11-15:** delegation recognises its delegate by the same checks
  as fan-in, checks again when it is aborted, and calls its `abort()` the same
  way: a subclass's override, an `abort` assigned or spied on the instance and a
  patched `AbortablePromise.prototype.abort` are called. A throw from it ends
  neither the loop over the promise's upstream links nor the abort: each link
  fires, then the first error is thrown, and the signal bindings are released
  either way. A throw from a link that fires at once, for a `resolve` after the
  abort, is dropped, since the promise is already settled. A Proxy over an
  `AbortablePromise` is a plain thenable to it, so abort does not travel through
  one. A controller passed to the constructor whose `abort()` throws is asked to
  abort before the rejection and the links, and its error does not stop them or
  the release of the signal bindings: it is thrown after the last link, ahead of
  an error from one. A controller whose signal has aborted already, because it
  was passed in aborted or another holder aborted it, is not asked to abort
  again.

- **A fresh `AbortError` per abort.** The imported implementation held a
  single `static readonly AbortError`, constructed once at module load.
  That reports one stack trace — pointing at the class definition, not at
  the abort — for every abort in the process, and makes all aborts
  reference-identical. Detection is `isAbortError`, which matches on the
  platform's `AbortError` name and so also recognises aborts raised by
  `fetch` and other signal-aware platform APIs that never construct our
  subclass.

- **Every signal binding is released when the promise settles.** This
  supersedes an earlier ruling that it could not be, which said: releasing
  on settlement would mean attaching a rejection handler to observe
  settlement, marking the promise as handled — either suppressing a
  genuine unhandled-rejection warning, or, if the handler rethrows to
  avoid that, manufacturing a spurious one from the promise the rethrow
  creates. Both consequences are real. The premise is not: they follow
  from observing settlement _from outside_, and `AbortState` is not
  outside. It is the bookkeeping that decides settlement —
  `claimSettlement` and `abort` are the moments themselves — so it can
  release from there with no handler attached and no effect on whether the
  promise counts as handled.

  What the earlier ruling accepted as its cost is therefore no longer
  paid: binding many short-lived promises to one long-lived signal used to
  accumulate a listener per promise, each pinning its closure and its
  whole `AbortState` until the signal aborted, which for an
  application-lifetime signal means never.

  The release is a plain `removeEventListener`, not a second
  `AbortController` passed as `addEventListener`'s `signal` option. That
  option reads better but costs an `AbortController` — and an
  `EventTarget` inside it — per binding, which is the allocation the
  ruling below exists to avoid.

  This covers both ways a foreign signal gets in: `abortOn`, and a
  controller handed to the constructor. `peer` shares a controller rather
  than binding to a signal, and `then` does not go through either, for a
  stronger reason given below: it links by plain callback and never
  touches a signal at all.

- **The `AbortController` is allocated lazily, and the executor receives a
  context rather than a signal.** An `AbortController` carries an
  `EventTarget`, and eagerly building one per promise cost four of them
  for a two-link chain — measured, not assumed. Nearly all of that was
  waste: a promise that is never aborted, and whose executor never looks
  at the signal, has no use for one.

  The executor's third argument is therefore an `AbortContext` — an object
  with a lazily realised `signal` getter — rather than an `AbortSignal`
  passed positionally. A positional argument must exist at call time, so
  laziness would have required guessing in advance whether the executor
  intended to use it; the only available tell was `executor.length`, and a
  `Function.length` heuristic in a constructor is not something this
  library should ask a reader to accept. A getter is also the shape the
  platform already uses — `controller.signal` is a property access — where
  a `getSignal()` thunk would have been the only place in the ecosystem
  that obtains a signal by calling something.

  The upstream link that `then` installs is a plain callback on the
  derived promise's state, not a listener on its signal, so chaining never
  forces a controller into existence. `peer` does force one, because
  sharing a controller is the entire point of it.

  A controller is still built the moment anything genuinely needs one: an
  executor reading `context.signal`, a caller passing one in, or `peer`.
  Tests pin that a `resolve().then().then()` chain allocates none, that
  abort works with none, and that upstream propagation works with none.

## Consequences

- Cancelling the tail of a chain cancels the work at the head, which is
  the property the type exists for.
- Two consumers of one abortable source can abort each other unless the
  branch point goes through `detach()`. This is a documented sharp edge:
  the class docblock says so, `detach()`'s docblock says when to reach
  for it, and a test pins the shielding behaviour.
- Aborts are recognised by `isAbortError`, never by identity or by
  `instanceof AbortError`. A test pins that each abort produces its own
  Error.
- Because `DOMException` inherits from `Error`, an `AbortError` is a
  valid `Failure` in the unboxed Result encoding: `promise/fail` passes
  it through with its concrete class intact rather than wrapping it in a
  `RejectionError`. A test pins that inheritance, since the encoding
  depends on it silently.
- An abort is a rejection, so aborting a promise nothing is consuming is
  an unhandled rejection, which Node treats as fatal. This falls out of
  rejecting rather than resolving on abort, and rejecting is what lets an
  abort travel through ordinary promise machinery at all — the
  alternative, resolving with some cancelled sentinel, would put a check
  for it in front of every `await`. The shapes this design is built around
  are safe, because something has attached a handler by construction: a
  chain handles its own head, `all`, `race`, `any` and `allSettled` handle
  their members, and `detach` leaves its source alone. Tests pin all
  three. What is exposed is holding a promise without consuming it —
  `AbortablePromise.abort()`, `abortOn` on a fire-and-forget promise, and
  `peer`, whose two promises are siblings rather than links and so handle
  nothing for each other. Each of those docblocks says so.
- Wrapping asynchronous work by delegating to it keeps the abort, so the
  obvious way to write such a promise is also the correct one. The price
  is latency for a delegate whose `then` is not the `Promise.prototype.then`
  captured when the module loads (an `AbortablePromise`, a plain thenable, a
  subclass that overrides `then`, a native promise with its own `then`): it
  is followed later than `new Promise` follows it.
- Fan-in costs three promises per member rather than one. Recorded rather
  than optimised, because the alternative is reimplementing four
  combinators whose semantics are worth inheriting exactly.

### Accepted runtime boundaries (review of PR 133)

The captured intrinsics are Promise, Promise.prototype.then, Reflect.apply,
Object.create and the prototype checks described above. Listener options use
a frozen null-prototype object. Other operations still consult mutable runtime
intrinsics: array push, splice and iteration, AbortController, EventTarget
listener methods, Promise factory methods and inherited Promise methods.
Replacing those is outside the hardening boundary; callers must retain their
ordinary behaviour. Capturing every operation would expand this change beyond
the smaller documentation boundary chosen for ticket 137.

The executor context is the AbortState instance to avoid a per-promise wrapper
allocation. Its TypeScript interface exposes only signal; this is not a runtime
security boundary. Untyped callers can reach the state methods and
sharedController, including claimSettlement, and can leave a promise pending
or change cancellation bookkeeping. This exposure is accepted; executors must
use only the declared AbortContext interface.
