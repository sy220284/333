/**
 * Privacy-preserving shape of a memory selection pass.
 *
 * Only aggregate counts and file ages are recorded.  Filenames,
 * descriptions, directory paths and memory contents are never logged.
 * This is gated by MEMORY_SHAPE_TELEMETRY at the caller.
 */
import { logEvent } from '../services/analytics/index.js'
import type { MemoryHeader } from './memoryScan.js'

const DAY_MS = 24 * 60 * 60 * 1000

export type MemoryRecallShape = {
  candidateCount: number
  selectedCount: number
  selectionRate: number
  newestSelectedAgeDays: number
  oldestSelectedAgeDays: number
  selectedLast7Days: number
}

/**
 * -1 is a distinct sentinel: a selection pass ran but returned no files.
 * The event is not emitted when the caller finds no memories at all.
 */
export function summarizeMemoryRecallShape(
  candidates: readonly MemoryHeader[],
  selected: readonly MemoryHeader[],
  now = Date.now(),
): MemoryRecallShape {
  const ages = selected.map(memory =>
    Math.max(0, Math.floor((now - memory.mtimeMs) / DAY_MS)),
  )
  return {
    candidateCount: candidates.length,
    selectedCount: selected.length,
    selectionRate: candidates.length === 0 ? 0 : selected.length / candidates.length,
    newestSelectedAgeDays: ages.length ? Math.min(...ages) : -1,
    oldestSelectedAgeDays: ages.length ? Math.max(...ages) : -1,
    selectedLast7Days: ages.filter(age => age < 7).length,
  }
}

export function logMemoryRecallShape(
  candidates: readonly MemoryHeader[],
  selected: readonly MemoryHeader[],
): void {
  const shape = summarizeMemoryRecallShape(candidates, selected)
  logEvent('tengu_memory_recall_shape', {
    candidate_count: shape.candidateCount,
    selected_count: shape.selectedCount,
    selection_rate: shape.selectionRate,
    newest_selected_age_days: shape.newestSelectedAgeDays,
    oldest_selected_age_days: shape.oldestSelectedAgeDays,
    selected_last_7_days: shape.selectedLast7Days,
  })
}
