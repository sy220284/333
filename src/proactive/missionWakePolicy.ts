/** Bound repeated idle wake-ups to changes in the durable mission journal.
 * Model turns with no verified checkpoint or assignment change must eventually
 * return control to the user rather than spending tokens indefinitely.
 */
export type MissionWakeState = {
  missionId: string
  revision: number
  unchangedWakes: number
}

export function evaluateMissionWake(
  previous: MissionWakeState | undefined,
  mission: { id: string; revision: number },
  maxUnchangedWakes = 2,
): { wake: boolean; state: MissionWakeState } {
  if (!Number.isInteger(maxUnchangedWakes) || maxUnchangedWakes < 1)
    throw new Error('Maximum unchanged mission wake count must be positive')
  const unchanged = previous?.missionId === mission.id && previous.revision === mission.revision
  const unchangedWakes = unchanged ? previous.unchangedWakes + 1 : 0
  const state = { missionId: mission.id, revision: mission.revision, unchangedWakes }
  return { wake: unchangedWakes < maxUnchangedWakes, state }
}
