/**
 * Settings type for the SDK public surface, tied to the same runtime
 * validator as ~/.claude/settings.json and the settings JSON Schema.
 * Every optional field, permission mode and policy option is inferred from
 * SettingsSchema rather than maintained in a separate handwritten mirror.
 */
import type { SettingsJson } from '../../utils/settings/types.js'

export type Settings = SettingsJson
