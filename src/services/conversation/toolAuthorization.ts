/** Tool authorization policy shared by the terminal, SDK hosts and future desktop UI.
 * No React or terminal renderer is required. Interactive hosts supply their own
 * permission queue and (optional) visual notifications. */
import { feature } from 'bun:bundle'
import { APIUserAbortError } from '@anthropic-ai/sdk'
import type { ToolPermissionContext, Tool as ToolType, ToolUseContext } from '../../Tool.js'
import { consumeSpeculativeClassifierCheck, peekSpeculativeClassifierCheck } from '../../tools/BashTool/bashPermissions.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import type { AssistantMessage } from '../../types/message.js'
import { recordAutoModeDenial } from '../../utils/autoModeDenials.js'
import { clearClassifierChecking, setClassifierApproval, setYoloClassifierApproval } from '../../utils/classifierApprovals.js'
import { logForDebugging } from '../../utils/debug.js'
import { AbortError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { hasPermissionsToUseTool } from '../../utils/permissions/permissions.js'
import { handleCoordinatorPermission } from '../../hooks/toolPermission/handlers/coordinatorHandler.js'
import { handleInteractivePermission } from '../../hooks/toolPermission/handlers/interactiveHandler.js'
import { handleSwarmWorkerPermission } from '../../hooks/toolPermission/handlers/swarmWorkerHandler.js'
import { createPermissionContext, type PermissionQueueOps } from '../../hooks/toolPermission/PermissionContext.js'
import { logPermissionDecision } from '../../hooks/toolPermission/permissionLogging.js'

export type CanUseToolFn<Input extends Record<string, unknown> = Record<string, unknown>> =
  (tool: ToolType, input: Input, toolUseContext: ToolUseContext,
   assistantMessage: AssistantMessage, toolUseID: string,
   forceDecision?: PermissionDecision<Input>) => Promise<PermissionDecision<Input>>

export type ToolAuthorizationHost = {
  setToolPermissionContext(context: ToolPermissionContext): void
  queueOps: PermissionQueueOps
  onAutoModeDenied?: (tool: ToolType, input: Record<string, unknown>, context: ToolUseContext) => void
  isPromptFocused?: () => boolean
}


/** The classifier and the two-second speculative check race must preserve
 * the original discriminated result types after moving out of the hook. */
function _temp(result: unknown) {
  return { type: 'result' as const, result }
}
function _temp2(resolve: (value: { type: 'timeout' }) => void) {
  return setTimeout(resolve, 2000, { type: 'timeout' as const })
}

/** Performs the existing config/hook/classifier/team/interactive checks without Ink. */
export function createToolAuthorization({ setToolPermissionContext, queueOps, onAutoModeDenied, isPromptFocused }: ToolAuthorizationHost): CanUseToolFn {
  return async (tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision) => new Promise(resolve => {
      const ctx = createPermissionContext(tool, input, toolUseContext, assistantMessage, toolUseID, setToolPermissionContext, queueOps);
      if (ctx.resolveIfAborted(resolve)) {
        return;
      }
      const decisionPromise = forceDecision !== undefined ? Promise.resolve(forceDecision) : hasPermissionsToUseTool(tool, input, toolUseContext, assistantMessage, toolUseID);
      return decisionPromise.then(async result => {
        if (result.behavior === "allow") {
          if (ctx.resolveIfAborted(resolve)) {
            return;
          }
          if (feature("TRANSCRIPT_CLASSIFIER") && result.decisionReason?.type === "classifier" && result.decisionReason.classifier === "auto-mode") {
            setYoloClassifierApproval(toolUseID, result.decisionReason.reason);
          }
          ctx.logDecision({
            decision: "accept",
            source: "config"
          });
          resolve(ctx.buildAllow(result.updatedInput ?? input, {
            decisionReason: result.decisionReason
          }));
          return;
        }
        const appState = toolUseContext.getAppState();
        const description = await tool.description(input as never, {
          isNonInteractiveSession: toolUseContext.options.isNonInteractiveSession,
          toolPermissionContext: appState.toolPermissionContext,
          tools: toolUseContext.options.tools
        });
        if (ctx.resolveIfAborted(resolve)) {
          return;
        }
        switch (result.behavior) {
          case "deny":
            {
              logPermissionDecision({
                tool,
                input,
                toolUseContext,
                messageId: ctx.messageId,
                toolUseID
              }, {
                decision: "reject",
                source: "config"
              });
              if (feature("TRANSCRIPT_CLASSIFIER") && result.decisionReason?.type === "classifier" && result.decisionReason.classifier === "auto-mode") {
                recordAutoModeDenial({
                  toolName: tool.name,
                  display: description,
                  reason: result.decisionReason.reason ?? "",
                  timestamp: Date.now()
                });
                onAutoModeDenied?.(tool, input, toolUseContext);
              }
              resolve(result);
              return;
            }
          case "ask":
            {
              if (appState.toolPermissionContext.awaitAutomatedChecksBeforeDialog) {
                const coordinatorDecision = await handleCoordinatorPermission({
                  ctx,
                  ...(feature("BASH_CLASSIFIER") ? {
                    pendingClassifierCheck: result.pendingClassifierCheck
                  } : {}),
                  updatedInput: result.updatedInput,
                  suggestions: result.suggestions,
                  permissionMode: appState.toolPermissionContext.mode
                });
                if (coordinatorDecision) {
                  resolve(coordinatorDecision);
                  return;
                }
              }
              if (ctx.resolveIfAborted(resolve)) {
                return;
              }
              const swarmDecision = await handleSwarmWorkerPermission({
                ctx,
                description,
                ...(feature("BASH_CLASSIFIER") ? {
                  pendingClassifierCheck: result.pendingClassifierCheck
                } : {}),
                updatedInput: result.updatedInput,
                suggestions: result.suggestions
              });
              if (swarmDecision) {
                resolve(swarmDecision);
                return;
              }
              if (feature("BASH_CLASSIFIER") && result.pendingClassifierCheck && tool.name === BASH_TOOL_NAME && !appState.toolPermissionContext.awaitAutomatedChecksBeforeDialog) {
                const speculativePromise = peekSpeculativeClassifierCheck((input as {
                  command: string;
                }).command);
                if (speculativePromise) {
                  const raceResult = await Promise.race([speculativePromise.then(_temp), new Promise(_temp2)]);
                  if (ctx.resolveIfAborted(resolve)) {
                    return;
                  }
                  const candidate = typeof raceResult === 'object' && raceResult !== null &&
                    'type' in raceResult && raceResult.type === 'result' &&
                    'result' in raceResult && typeof raceResult.result === 'object' && raceResult.result !== null
                    ? raceResult.result : null;
                  const accepted = candidate !== null && 'matches' in candidate &&
                    candidate.matches === true && 'confidence' in candidate && candidate.confidence === 'high';
                  if (accepted && feature("BASH_CLASSIFIER")) {
                    consumeSpeculativeClassifierCheck((input as {
                      command: string;
                    }).command);
                    const matchedRule = candidate && 'matchedDescription' in candidate &&
                      typeof candidate.matchedDescription === 'string' ? candidate.matchedDescription : undefined;
                    if (matchedRule) {
                      setClassifierApproval(toolUseID, matchedRule);
                    }
                    ctx.logDecision({
                      decision: "accept",
                      source: {
                        type: "classifier"
                      }
                    });
                    resolve(ctx.buildAllow(result.updatedInput ?? input as Record<string, unknown>, {
                      decisionReason: {
                        type: "classifier" as const,
                        classifier: "bash_allow" as const,
                        reason: `Allowed by prompt rule: "${matchedRule ?? ''}"`
                      }
                    }));
                    return;
                  }
                }
              }
              handleInteractivePermission({
                ctx,
                description,
                result,
                awaitAutomatedChecksBeforeDialog: appState.toolPermissionContext.awaitAutomatedChecksBeforeDialog,
                isPromptFocused,
                bridgeCallbacks: feature("BRIDGE_MODE") ? appState.replBridgePermissionCallbacks : undefined,
                channelCallbacks: feature("KAIROS") || feature("KAIROS_CHANNELS") ? appState.channelPermissionCallbacks : undefined
              }, resolve);
              return;
            }
        }
      }).catch(error => {
        if (error instanceof AbortError || error instanceof APIUserAbortError) {
          logForDebugging(`Permission check threw ${error.constructor.name} for tool=${tool.name}: ${error.message}`);
          ctx.logCancelled();
          resolve(ctx.cancelAndAbort(undefined, true));
        } else {
          logError(error);
          resolve(ctx.cancelAndAbort(undefined, true));
        }
      }).finally(() => {
        clearClassifierChecking(toolUseID);
      });
    });
}
