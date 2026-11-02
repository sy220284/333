/** 保留嵌套对象结构的只读视图；函数签名保持不变。 */
export type DeepImmutable<T> =
  T extends (...args: never[]) => unknown ? T :
  T extends Map<infer K, infer V> ? ReadonlyMap<DeepImmutable<K>, DeepImmutable<V>> :
  T extends Set<infer V> ? ReadonlySet<DeepImmutable<V>> :
  T extends readonly (infer Item)[] ? readonly DeepImmutable<Item>[] :
  T extends object ? { readonly [P in keyof T]: DeepImmutable<T[P]> } :
  T

/**
 * Enumerate each complete ordering of a finite literal union. Used by the
 * command queue's NON_EDITABLE_MODES declaration to enforce every variant is
 * represented exactly once at compile time.
 */
export type Permutations<T, Current = T> =
  [T] extends [never] ? [] :
  T extends Current ? [T, ...Permutations<Exclude<Current, T>>] : never
