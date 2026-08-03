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

- **A fresh `AbortError` per abort.** The imported implementation held a
  single `static readonly AbortError`, constructed once at module load.
  That reports one stack trace — pointing at the class definition, not at
  the abort — for every abort in the process, and makes all aborts
  reference-identical. Detection is `isAbortError`, which matches on the
  platform's `AbortError` name and so also recognises aborts raised by
  `fetch` and other signal-aware platform APIs that never construct our
  subclass.

- **`abortOn` does not release its listener when the promise settles.**
  It registers `{ once: true }`, so the listener goes as soon as the
  signal aborts. Releasing it on settlement would mean attaching a
  rejection handler to observe settlement, which marks the promise as
  handled — either suppressing a genuine unhandled-rejection warning, or,
  if the handler rethrows to avoid that, manufacturing a spurious one
  from the promise the rethrow creates. The cost of not releasing is that
  binding many short-lived promises to one long-lived signal accumulates
  listeners on that signal until it aborts, which the docblock states.

  `then` does not go through `abortOn` at all, for a stronger reason
  given below: it links by plain callback and never touches a signal.

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
