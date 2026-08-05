// The floor for /call: a consumer who never wants abortability at all.
// The Call Box has no such floor — `.abortable` is on the prototype.
export const out = ((n) => n)(1)
