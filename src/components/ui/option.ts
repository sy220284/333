import type { OptionWithDescription } from '../CustomSelect/select.js'

/**
 * Rules UI passes text-only options to the shared Select control.
 * Reuse its source-of-truth option contract to keep labels, values,
 * descriptions and disabled state consistent.
 */
export type Option = OptionWithDescription<string>
