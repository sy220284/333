import {runRunnerWizard317} from './wizard317.ts'
/** Entry dedicated to Claude Code 2.1.317 self-hosted-runner doctor. */
export async function selfHostedRunnerDoctorMain317(args:readonly string[]):Promise<void>{
  process.exitCode=runRunnerWizard317('doctor',args)
}
