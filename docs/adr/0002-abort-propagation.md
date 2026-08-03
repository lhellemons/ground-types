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

  `then` does not go through `abortOn` for this reason: the derived
  promise's signal lives and dies with that promise, so there is nothing
  to accumulate on, and the public method's machinery is aimed at a
  problem the internal link does not have.

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
