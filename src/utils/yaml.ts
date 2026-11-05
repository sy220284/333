/**
 * YAML parsing wrapper.
 *
 * Uses Bun.YAML (built-in, zero-cost) when running under Bun, otherwise falls
 * back to the `yaml` npm package. The package is lazy-required inside the
 * non-Bun branch so native Bun builds never load the ~270KB yaml parser.
 */

import { createRequire } from 'node:module'

const load = createRequire(import.meta.url)

export function parseYaml(input: string): unknown {
  if (typeof Bun !== 'undefined') {
    return Bun.YAML.parse(input)
  }
  return (load('yaml') as typeof import('yaml')).parse(input)
}
