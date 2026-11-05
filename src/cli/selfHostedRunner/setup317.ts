import {runRunnerWizard317} from './wizard317.ts'
/** Entry dedicated to Claude Code 2.1.317 self-hosted-runner setup. */
export async function selfHostedRunnerSetupMain317(args:readonly string[]):Promise<void>{
  process.exitCode=runRunnerWizard317('setup',args)
}
