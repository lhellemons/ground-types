# PROTOTYPE #117 — the BestEffort kit against the consumer's best-effort parse

Throwaway probe for
[#117](https://github.com/lhellemons/ground-types/issues/117). Nothing
here is part of the library: `src/` never imports it, and nothing in
`src/` changes. The kit imports the library by relative path.

    prototypes/117/run.sh

The script typechecks the kit and the port against `src/` on main, then
runs the type probes (`probe.test-d.ts`) and the runtime probes
(`probe.runtime.ts`).

| File             | What                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `best-effort.ts` | The kit: `bestEffort`, `map`, `andThen`, `note`, `gather`, `recover`, `toResult`, plus `toResultUnguarded` as the measured alternative                |
| `consumer.ts`    | a consumer's world-document parser cut to its best-effort paths and ported: a three-state reader, `validateBoardEntry`'s drop-a-piece, the retry loop |

The decisions and every pinned fact are in
`docs/adr/0006-best-effort.md`; the vocabulary in `CONTEXT.md` ("Best
Effort", "Diagnostic").
