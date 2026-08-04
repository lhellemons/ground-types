declare const brand: unique symbol

/**
 * A phantom marker attached to a type so that two structurally identical
 * types are not interchangeable. Exists only at compile time — the brand
 * key is a module-private `unique symbol`, so it has no runtime
 * representation, cannot be forged from outside this module, and does not
 * appear in `keyof` on a branded value.
 */
export type Brand<B> = { readonly [brand]: B }

/**
 * Applies a {@link Brand} to an underlying type `T`. A `Branded<T, B>` is
 * still assignable *to* `T` (it structurally contains everything `T`
 * requires), but a plain `T` is not assignable *to* `Branded<T, B>` — only
 * a validated construction path (see `value-object` and `domain`) can
 * produce one.
 */
export type Branded<T, B> = T & Brand<B>
