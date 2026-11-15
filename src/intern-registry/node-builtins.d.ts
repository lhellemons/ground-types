/* The library deliberately avoids @types/node (see tsconfig.json), so the two
   Node built-ins the real-GC test in index.test.ts needs are declared here,
   scoped to what that test uses. */
declare module 'node:v8' {
  export function setFlagsFromString(flags: string): void
}
declare module 'node:vm' {
  export function runInNewContext(code: string): unknown
}
