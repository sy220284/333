/** Explicit, locally configured API pricing per million tokens. */
import { promises as fs, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isRemovedIndependentModel, resolveIndependentModel } from './registry.js'
const ROOT = join(homedir(), '.333', 'models')
const FILE = join(ROOT, 'pricing.json')
export type Price = { input: number; output: number; cacheRead?: number; cacheWrite?: number }
function valid(price: Price): boolean {
  return Boolean(price && Number.isFinite(price.input) && price.input >= 0 &&
    Number.isFinite(price.output) && price.output >= 0 &&
    (price.cacheRead === undefined || (Number.isFinite(price.cacheRead) && price.cacheRead >= 0)) &&
    (price.cacheWrite === undefined || (Number.isFinite(price.cacheWrite) && price.cacheWrite >= 0)))
}
export function readIndependentPricing(): Record<string, Price> {
  let json: string
  try { json=readFileSync(FILE,'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
  const prices=JSON.parse(json) as Record<string, Price>
  if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new Error('Invalid provider pricing store')
  const active: Record<string, Price> = {}
  for (const [name, price] of Object.entries(prices)) {
    if (isRemovedIndependentModel(name)) continue
    if (!resolveIndependentModel(name) || !valid(price)) throw new Error(`Invalid provider pricing record: ${name}`)
    active[name] = price
  }
  return active
}
export async function configureIndependentPricing(model: string, price: Price): Promise<void> {
  if (!resolveIndependentModel(model) || !valid(price)) throw new Error('Model pricing requires qualified model ID and valid nonnegative USD rates')
  await fs.mkdir(ROOT, {recursive:true,mode:0o700})
  const next={...readIndependentPricing(),[model]:price}
  const tmp=join(ROOT,`pricing.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(tmp,JSON.stringify(next,null,2),{encoding:'utf8',mode:0o600,flag:'wx'})
    await fs.rename(tmp,FILE)
    await fs.chmod(FILE,0o600)
  } finally { await fs.rm(tmp,{force:true}) }
}
