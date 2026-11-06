// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { getInitialMainLoopModel } from '../../bootstrap/state.js'
import { getSavedModelOptions } from '../../services/api/multimodel/catalog.js'
import { isRemovedIndependentModel } from '../../services/api/multimodel/registry.js'
import { isClaudeAISubscriber } from '../auth.js'
import { getInitialSettings } from '../settings/settings.js'
import { getAPIProvider } from './providers.js'
import { getAntModels } from './antModels.js'
import { isModelAllowed } from './modelAllowlist.js'
import {
  getClaudeAiUserDefaultModelDescription,
  getDefaultSonnetModel,
  getDefaultOpusModel,
  getDefaultHaikuModel,
  getDefaultFableModel,
  getDefaultMainLoopModelSetting,
  getMarketingNameForModel,
  getUserSpecifiedModelSetting,
  renderDefaultModelSetting,
  type ModelSetting,
} from './model.js'
import { has1mContext } from '../context.js'
import { getGlobalConfig } from '../config.js'
import { getCatalogModel, getCatalogModelsForProvider, isLegacyClaudeModel } from './modelCatalog.js'
import { isModelAlias } from './aliases.js'
import { getPublicModelDisplayName, parseUserSpecifiedModel } from './model.js'
import { getModelPricingString } from '../modelCost.js'

// @[MODEL LAUNCH]: Update all the available and default model option strings below.

export type ModelOption = {
  value: ModelSetting
  label: string
  description: string
  descriptionForModel?: string
}

export function getDefaultOptionForUser(fastMode: boolean = false): ModelOption {
  if (process.env.USER_TYPE === 'ant') {
    const currentModel = renderDefaultModelSetting(
      getDefaultMainLoopModelSetting(),
    )
    return {
      value: null,
      label: 'Default (recommended)',
      description: `Use the default model for Ants (currently ${currentModel})`,
      descriptionForModel: `Default model (currently ${currentModel})`,
    }
  }

  // Subscribers
  if (isClaudeAISubscriber()) {
    return {
      value: null,
      label: 'Default (recommended)',
      description: getClaudeAiUserDefaultModelDescription(fastMode),
    }
  }

  // PAYG
  const is3P = getAPIProvider() !== 'firstParty'
  const defaultModel = is3P ? getDefaultSonnetModel() : getDefaultOpusModel()
  const pricing = getModelPricingString(defaultModel)
  return {
    value: null,
    label: 'Default (recommended)',
    description: `Use the default model (currently ${renderDefaultModelSetting(getDefaultMainLoopModelSetting())})${is3P || !pricing ? '' : ` · ${pricing}`}`,
  }
}


function getCustomSonnetOption(): ModelOption | undefined {
  const is3P = getAPIProvider() !== 'firstParty'
  const customSonnetModel = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
  // When a 3P user has a custom sonnet model string, show it directly
  if (is3P && customSonnetModel) {
    const is1m = has1mContext(customSonnetModel)
    return {
      value: 'sonnet',
      label:
        process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME ?? customSonnetModel,
      description:
        process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION ??
        `Custom Sonnet model${is1m ? ' (1M context)' : ''}`,
      descriptionForModel: `${process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION ?? `Custom Sonnet model${is1m ? ' with 1M context' : ''}`} (${customSonnetModel})`,
    }
  }
}

function getCustomOpusOption(): ModelOption | undefined {
  const is3P = getAPIProvider() !== 'firstParty'
  const customOpusModel = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL
  // When a 3P user has a custom opus model string, show it directly
  if (is3P && customOpusModel) {
    const is1m = has1mContext(customOpusModel)
    return {
      value: 'opus',
      label: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME ?? customOpusModel,
      description:
        process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION ??
        `Custom Opus model${is1m ? ' (1M context)' : ''}`,
      descriptionForModel: `${process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION ?? `Custom Opus model${is1m ? ' with 1M context' : ''}`} (${customOpusModel})`,
    }
  }
}

function getCustomHaikuOption(): ModelOption | undefined {
  const is3P = getAPIProvider() !== 'firstParty'
  const customHaikuModel = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL
  // When a 3P user has a custom haiku model string, show it directly
  if (is3P && customHaikuModel) {
    return {
      value: 'haiku',
      label: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME ?? customHaikuModel,
      description:
        process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION ??
        'Custom Haiku model',
      descriptionForModel: `${process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION ?? 'Custom Haiku model'} (${customHaikuModel})`,
    }
  }
}

type PresetFamily = 'opus' | 'sonnet' | 'haiku' | 'fable'

function getCurrentFamilyOption(family: PresetFamily): ModelOption {
  const defaults: Record<PresetFamily, () => string> = {
    opus: getDefaultOpusModel,
    sonnet: getDefaultSonnetModel,
    haiku: getDefaultHaikuModel,
    fable: getDefaultFableModel,
  }
  const id = defaults[family]()
  const label = getPublicModelDisplayName(id) ?? getCatalogModel(id)?.display_name ?? family
  const pricing = getModelPricingString(id)
  return {
    value: family,
    label,
    description: [label, pricing].filter(Boolean).join(' · '),
    descriptionForModel: `${label} (${id})`,
  }
}

function getOpusPlanOption(): ModelOption {
  return {
    value: 'opusplan',
    label: 'Opus Plan Mode',
    description: `Use ${getCurrentFamilyOption('opus').label} in plan mode, ${getCurrentFamilyOption('sonnet').label} otherwise`,
  }
}

function getModelOptionsBase(fastMode = false): ModelOption[] {
  const options: ModelOption[] = [getDefaultOptionForUser(fastMode)]
  if (process.env.USER_TYPE === 'ant') {
    options.push(...getAntModels().map(model => ({
      value: model.alias,
      label: model.label,
      description: model.description ?? `${model.label} (${model.model})`,
    })))
  }
  const families: PresetFamily[] = isClaudeAISubscriber()
    ? ['opus', 'sonnet', 'haiku']
    : ['opus', 'sonnet', 'haiku', 'fable']
  for (const family of families) {
    const custom = getAPIProvider() !== 'firstParty'
      ? family === 'sonnet' ? getCustomSonnetOption()
        : family === 'opus' ? getCustomOpusOption()
        : family === 'haiku' ? getCustomHaikuOption()
        : undefined
      : undefined
    options.push(custom ?? getCurrentFamilyOption(family))
  }
  return options
}

// @[MODEL LAUNCH]: Add the new model ID to the appropriate family pattern below
// so the "newer version available" hint works correctly.
/**
 * Map a full model name to its family alias and the marketing name of the
 * version the alias currently resolves to. Used to detect when a user has
 * a specific older version pinned and a newer one is available.
 */
function getModelFamilyInfo(
  model: string,
): { alias: string; currentVersionName: string } | null {
  const entry = getCatalogModel(model)
  if (!entry) return null
  const defaults: Record<string, () => string> = {
    sonnet: getDefaultSonnetModel,
    opus: getDefaultOpusModel,
    haiku: getDefaultHaikuModel,
    fable: getDefaultFableModel,
  }
  const resolveDefault = defaults[entry.family]
  if (!resolveDefault) return null
  const currentModel = resolveDefault()
  const currentVersionName = getCatalogModel(currentModel)?.display_name ??
    getMarketingNameForModel(currentModel)
  return currentVersionName
    ? { alias: entry.family.charAt(0).toUpperCase() + entry.family.slice(1), currentVersionName }
    : null
}

/**
 * Returns a ModelOption for a known Anthropic model with a human-readable
 * label, and an upgrade hint if a newer version is available via the alias.
 * Returns null if the model is not recognized.
 */
function getKnownModelOption(model: string): ModelOption | null {
  const marketingName = getMarketingNameForModel(model)
  if (!marketingName) return null

  const familyInfo = getModelFamilyInfo(model)
  if (!familyInfo) {
    return {
      value: model,
      label: marketingName,
      description: model,
    }
  }

  // Check if the alias currently resolves to a different (newer) version
  if (marketingName !== familyInfo.currentVersionName) {
    return {
      value: model,
      label: marketingName,
      description: `Newer version available · select ${familyInfo.alias} for ${familyInfo.currentVersionName}`,
    }
  }

  // Same version as the alias — just show the friendly name
  return {
    value: model,
    label: marketingName,
    description: model,
  }
}

export function getModelOptions(fastMode: boolean = false): ModelOption[] {
  const options = getModelOptionsBase(fastMode).map(option => {
    if (option.value === null || !isModelAlias(option.value)) return option
    const model = parseUserSpecifiedModel(option.value)
    const entry = getCatalogModel(model)
    const label = getPublicModelDisplayName(model)
    if (!entry || !label) return option
    const price = getModelPricingString(model)
    return { ...option, label, description: [entry.display_name, price].filter(Boolean).join(' · '), descriptionForModel: `${label} (${model})` }
  })

  // Add the custom model from the ANTHROPIC_CUSTOM_MODEL_OPTION env var
  const envCustomModel = process.env.ANTHROPIC_CUSTOM_MODEL_OPTION
  if (
    envCustomModel &&
    !options.some(existing => existing.value === envCustomModel)
  ) {
    options.push({
      value: envCustomModel,
      label: process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME ?? envCustomModel,
      description:
        process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION ??
        `Custom model (${envCustomModel})`,
    })
  }

  // Build visible choices from the same provider-specific catalog used for
  // model resolution. Subscription choices retain their entitlement rules.
  // Restricted Mythos models remain selectable by explicit ID after access.
  if (!isClaudeAISubscriber()) {
    const provider = getAPIProvider()
    const catalogProvider = provider === 'firstParty' ? 'first_party' : provider
    for (const entry of getCatalogModelsForProvider(catalogProvider)) {
      if (entry.family === 'mythos') continue // Model requires separate authorization
      const id = entry.provider_ids[catalogProvider]
      if (typeof id !== 'string' || options.some(option => option.value !== null && parseUserSpecifiedModel(option.value) === id)) continue
      const pricing = getModelPricingString(id)
      options.push({
        value: id,
        label: entry.display_name,
        description: [entry.display_name, pricing].filter(Boolean).join(' · '),
        descriptionForModel: `${entry.display_name} (${id})`,
      })
    }
  }

  // Append models confirmed by the connected provider's discovery endpoint.
  // The original Claude options and prompts remain unchanged.
  for (const option of getSavedModelOptions()) {
    if (!options.some(existing => existing.value === option.value)) {
      options.push(option)
    }
  }

  // Append additional model options fetched during bootstrap
  for (const opt of getGlobalConfig().additionalModelOptionsCache ?? []) {
    if (!options.some(existing => existing.value === opt.value)) {
      options.push(opt)
    }
  }

  // Add custom model from either the current model value or the initial one
  // if it is not already in the options.
  let customModel: ModelSetting = null
  const currentMainLoopModel = getUserSpecifiedModelSetting()
  const initialMainLoopModel = getInitialMainLoopModel()
  if (currentMainLoopModel !== undefined && currentMainLoopModel !== null) {
    customModel = currentMainLoopModel
  } else if (initialMainLoopModel !== null) {
    customModel = initialMainLoopModel
  }
  if (customModel === null || options.some(opt => opt.value === customModel)) {
    return filterModelOptionsByAllowlist(options)
  } else if (customModel === 'opusplan') {
    return filterModelOptionsByAllowlist([...options, getOpusPlanOption()])
  } else {
    // Try to show a human-readable label for known Anthropic models, with an
    // upgrade hint if the alias now resolves to a newer version.
    const knownOption = getKnownModelOption(customModel)
    if (knownOption) {
      options.push(knownOption)
    } else {
      options.push({
        value: customModel,
        label: customModel,
        description: 'Custom model',
      })
    }
    return filterModelOptionsByAllowlist(options)
  }
}

/**
 * Filter model options by the availableModels allowlist.
 * Always preserves the "Default" option (value: null).
 */
function filterModelOptionsByAllowlist(options: ModelOption[]): ModelOption[] {
  const settings = getInitialSettings() || {}
  const selected = getUserSpecifiedModelSetting()
  const startup = getInitialMainLoopModel()
  const explicitCustom = process.env.ANTHROPIC_CUSTOM_MODEL_OPTION
  return options.filter(option => {
    if (option.value === null) return true
    if (isRemovedIndependentModel(option.value)) return false
    if (isLegacyClaudeModel(option.value) &&
        option.value !== selected && option.value !== startup && option.value !== explicitCustom) {
      return false
    }
    return !settings.availableModels || isModelAllowed(option.value)
  })
}
