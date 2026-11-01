/** 保留嵌套对象结构的只读视图；函数签名保持不变。 */
export type DeepImmutable<T> =
  T extends (...args: never[]) => unknown ? T :
  T extends Map<infer K, infer V> ? ReadonlyMap<DeepImmutable<K>, DeepImmutable<V>> :
  T extends Set<infer V> ? ReadonlySet<DeepImmutable<V>> :
  T extends readonly (infer Item)[] ? readonly DeepImmutable<Item>[] :
  T extends object ? { readonly [P in keyof T]: DeepImmutable<T[P]> } :
  T
