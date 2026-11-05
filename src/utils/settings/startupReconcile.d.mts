export function findUnobservedStartupChanges(
  before: Map<string, string | null>,
  after: Map<string, string | null>,
  observed: Set<string>,
): Array<{ path: string; kind: 'change' | 'delete' }>
