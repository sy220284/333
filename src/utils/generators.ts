const NO_VALUE = Symbol('NO_VALUE')

export async function lastX<A>(as: AsyncGenerator<A>): Promise<A> {
  let lastValue: A | typeof NO_VALUE = NO_VALUE
  for await (const a of as) {
    lastValue = a
  }
  if (lastValue === NO_VALUE) {
    throw new Error('No items in generator')
  }
  return lastValue
}

export async function returnValue<A>(
  as: AsyncGenerator<unknown, A>,
): Promise<A> {
  while (true) {
    const result = await as.next()
    if (result.done) return result.value
  }
}

type QueuedGenerator<A> = {
  result: IteratorResult<A, void>
  generator: AsyncGenerator<A, void>
}

// Run all generators concurrently up to a concurrency cap, yielding values as they come in
export async function* all<A>(
  generators: AsyncGenerator<A, void>[],
  concurrencyCap = Infinity,
): AsyncGenerator<A, void> {
  if (concurrencyCap !== Infinity &&
      (!Number.isInteger(concurrencyCap) || concurrencyCap < 1)) {
    throw new RangeError('Generator concurrency cap must be a positive integer')
  }
  const next = async (generator: AsyncGenerator<A, void>): Promise<QueuedGenerator<A>> => ({
    generator,
    result: await generator.next(),
  })
  const waiting = [...generators]
  // The generator itself identifies the outstanding operation. Each active
  // generator has exactly one next() request, so no promise self-reference is needed.
  const active = new Map<AsyncGenerator<A, void>, Promise<QueuedGenerator<A>>>()

  while (active.size < concurrencyCap && waiting.length > 0) {
    const generator = waiting.shift()
    if (generator) active.set(generator, next(generator))
  }

  while (active.size > 0) {
    const { result, generator } = await Promise.race(active.values())
    active.delete(generator)

    if (result.done === false) {
      active.set(generator, next(generator))
      if (result.value !== undefined) {
        yield result.value
      }
    } else {
      const nextGenerator = waiting.shift()
      if (nextGenerator) active.set(nextGenerator, next(nextGenerator))
    }
  }
}

export async function toArray<A>(
  generator: AsyncGenerator<A, void>,
): Promise<A[]> {
  const result: A[] = []
  for await (const a of generator) {
    result.push(a)
  }
  return result
}

export async function* fromArray<T>(values: T[]): AsyncGenerator<T, void> {
  for (const value of values) {
    yield value
  }
}
