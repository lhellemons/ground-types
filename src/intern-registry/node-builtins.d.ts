/* The library deliberately avoids @types/node (see tsconfig.json), so the Node
   built-ins the tests need (the real-GC test in index.test.ts, and the promise
   tests that run code in another realm and count listeners) are declared here,
   scoped to what they use. tsconfig.build.json excludes this file, so a source
   file that imports one of these modules fails the build. */
declare module 'node:v8' {
  export function setFlagsFromString(flags: string): void
}
declare module 'node:vm' {
  export function runInNewContext(code: string): unknown
}
declare module 'node:events' {
  export function getEventListeners(
    emitter: EventTarget,
    type: string,
  ): unknown[]
}
