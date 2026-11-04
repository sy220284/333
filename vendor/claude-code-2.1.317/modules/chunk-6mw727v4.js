// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{JR}from"./chunk-wxyh2ndv.js";import{wFi}from"./chunk-hjky7hz8.js";import{QZt}from"./chunk-dk152bb6.js";import{kc,r$i}from"./chunk-nj8ddyrh.js";import{odi,sdi}from"./chunk-ttn3wae7.js";function zFt(e){return{PreToolUse:{summary:"Before tool execution",description:`Input to command is JSON of tool call arguments.
Exit code 0 - stdout/stderr not shown
Exit code 2 - show stderr to model and block tool call
Other exit codes - show stderr to user only but continue with tool call`,matcherMetadata:{fieldToMatch:"tool_name",values:e}},PostToolUse:{summary:"After tool execution",description:`Input to command is JSON with fields "inputs" (tool call arguments) and "response" (tool call response).
Exit code 0 - stdout shown in transcript mode (ctrl+o)
Exit code 2 - show stderr to model immediately
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"tool_name",values:e}},PostToolUseFailure:{summary:"After tool execution fails",description:`Input to command is JSON with tool_name, tool_input, tool_use_id, error, error_type, is_interrupt, and is_timeout.
Exit code 0 - stdout shown in transcript mode (ctrl+o)
Exit code 2 - show stderr to model immediately
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"tool_name",values:e}},PostToolBatch:{summary:"After a batch of tool calls resolves",description:`Fires once after every tool call in a batch has resolved, before the next model request. Input includes tool_calls (array of {tool_name, tool_input, tool_use_id, tool_response}).
Return additionalContext via hookSpecificOutput to inject context once for the whole batch.
Exit code 2 - stop the agentic loop (stderr shown to user only)
Other exit codes - show stderr to user only`},PermissionDenied:{summary:"After auto mode denies a tool call",description:`Input to command is JSON with tool_name, tool_input, tool_use_id, and reason.
Return {"hookSpecificOutput":{"hookEventName":"PermissionDenied","retry":true}} to tell the model it may retry.
Exit code 0 - stdout shown in transcript mode (ctrl+o)
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"tool_name",values:e}},Notification:{summary:"When notifications are sent",description:`Input to command is JSON with notification message and type.
Exit code 0 - stdout/stderr not shown
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"notification_type",values:[...wFi,"elicitation_complete","elicitation_response"]}},UserPromptSubmit:{summary:"When the user submits a prompt",description:`Input to command is JSON with original user prompt text.
Exit code 0 - stdout shown to Claude
Exit code 2 - block processing, erase original prompt, and show stderr to user only
Other exit codes - show stderr to user only`},UserPromptExpansion:{summary:"When a user-typed slash command expands into a prompt",description:`Input to command is JSON with expansion_type, command_name, command_args, command_source, and original prompt.
Exit code 0 - stdout shown to Claude
Exit code 2 - block expansion and show stderr to user only
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"command_name",values:[]}},SessionStart:{summary:"When a new session is started",description:`Input to command is JSON with session start source.
Exit code 0 - stdout shown to Claude
Exit code 2 - show stderr to user only
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"source",values:["startup","resume","clear","compact","fork"]}},Stop:{summary:"Right before Claude concludes its response",description:`Exit code 0 - stdout/stderr not shown
Exit code 2 - show stderr to model and continue conversation
Other exit codes - show stderr to user only`},StopFailure:{summary:"When the turn ends due to an API error",description:"Fires instead of Stop when an API error (rate limit, auth failure, etc.) ended the turn. Fire-and-forget \u2014 hook output and exit codes are ignored.",matcherMetadata:{fieldToMatch:"error",values:["rate_limit","overloaded","authentication_failed","oauth_org_not_allowed",...QZt()?["account_on_hold"]:[],"verification_required","billing_error","invalid_request","model_not_found","server_error","max_output_tokens","cloud_credential_error","unknown"]}},SubagentStart:{summary:"When a subagent (Agent tool call) is started",description:`Input to command is JSON with agent_id and agent_type.
Exit code 0 - JSON additionalContext shown to subagent
Exit code 2 - show stderr to user only
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"agent_type",values:[]}},SubagentStop:{summary:"Right before a subagent (Agent tool call) concludes its response",description:`Input to command is JSON with agent_id, agent_type, and agent_transcript_path.
Exit code 0 - stdout/stderr not shown
Exit code 2 - show stderr to subagent and continue having it run
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"agent_type",values:[]}},PreCompact:{summary:"Before conversation compaction",description:`Input to command is JSON with compaction details.
Exit code 0 - stdout appended as custom compact instructions
Exit code 2 - block compaction
Other exit codes - show stderr to user only but continue with compaction`,matcherMetadata:{fieldToMatch:"trigger",values:["manual","auto"]}},PostCompact:{summary:"After conversation compaction",description:`Input to command is JSON with compaction details and the summary.
Exit code 0 - stdout shown to user
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"trigger",values:["manual","auto"]}},PreModelSwitch:{summary:"Before a requested model switch (/model, model picker, set_model)",description:`Input to command is JSON with from_model, to_model, requested_model, source, context_tokens and the estimated re-cache cost.
Exit code 0 - switch proceeds; JSON permissionDecision allow/deny/ask as for PreToolUse
Exit code 2 - block the switch and show stderr to user
Other exit codes - show stderr to user only and continue`,matcherMetadata:{fieldToMatch:"to_model",values:[]}},PostModelSwitch:{summary:"After the session model changes (any cause)",description:`Input to command is JSON with from_model, to_model, requested_model, source, context_tokens and the estimated re-cache cost.
Exit code 0 - stdout shown to Claude on the next request
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"to_model",values:[]}},SessionEnd:{summary:"When a session is ending",description:`Input to command is JSON with session end reason.
Exit code 0 - command completes successfully
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"reason",values:[...r$i]}},PermissionRequest:{summary:"When a permission dialog is displayed",description:`Input to command is JSON with tool_name, tool_input, and tool_use_id.
Output JSON with hookSpecificOutput containing decision to allow or deny.
Exit code 0 - use hook decision if provided
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"tool_name",values:e}},Setup:{summary:"Repo setup hooks for init and maintenance",description:`Input to command is JSON with trigger (init or maintenance).
Exit code 0 - JSON additionalContext shown to Claude
Exit code 2 - show stderr to user only
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"trigger",values:["init","maintenance"]}},TeammateIdle:{summary:"When a teammate is about to go idle",description:`Input to command is JSON with teammate_name and team_name.
Exit code 0 - stdout/stderr not shown
Exit code 2 - show stderr to teammate and prevent idle (teammate continues working)
Other exit codes - show stderr to user only`},TaskCreated:{summary:"When a task is being created",description:`Input to command is JSON with task_id, task_subject, task_description, teammate_name, and team_name.
Exit code 0 - stdout/stderr not shown
Exit code 2 - show stderr to model and prevent task creation
Other exit codes - show stderr to user only`},TaskCompleted:{summary:"When a task is being marked as completed",description:`Input to command is JSON with task_id, task_subject, task_description, teammate_name, and team_name.
Exit code 0 - stdout/stderr not shown
Exit code 2 - show stderr to model and prevent task completion
Other exit codes - show stderr to user only`},Elicitation:{summary:"When an MCP server requests user input (elicitation)",description:`Input to command is JSON with mcp_server_name, message, and requested_schema.
Output JSON with hookSpecificOutput containing action (accept/decline/cancel) and optional content.
Exit code 0 - use hook response if provided
Exit code 2 - deny the elicitation
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"mcp_server_name",values:[]}},ElicitationResult:{summary:"After a user responds to an MCP elicitation",description:`Input to command is JSON with mcp_server_name, action, content, mode, and elicitation_id.
Output JSON with hookSpecificOutput containing optional action and content to override the response.
Exit code 0 - use hook response if provided
Exit code 2 - block the response (action becomes decline)
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"mcp_server_name",values:[]}},ConfigChange:{summary:"When configuration files change during a session",description:`Input to command is JSON with source (user_settings, project_settings, local_settings, policy_settings, skills) and file_path.
Exit code 0 - allow the change
Exit code 2 - block the change from being applied to the session
Other exit codes - show stderr to user only`,matcherMetadata:{fieldToMatch:"source",values:["user_settings","project_settings","local_settings","policy_settings","skills"]}},InstructionsLoaded:{summary:"When an instruction file (CLAUDE.md or rule) is loaded",description:`Input to command is JSON with file_path, memory_type (User, Project, Local, Managed), load_reason (session_start, nested_traversal, path_glob_match, include, compact), globs (optional \u2014 the paths: frontmatter patterns that matched), trigger_file_path (optional \u2014 the file Claude touched that caused the load), and parent_file_path (optional \u2014 the file that @-included this one).
Exit code 0 - command completes successfully
Other exit codes - show stderr to user only
This hook is observability-only and does not support blocking.`,matcherMetadata:{fieldToMatch:"load_reason",values:["session_start","nested_traversal","path_glob_match","include","compact"]}},WorktreeCreate:{summary:"Create an isolated worktree for VCS-agnostic isolation",description:`Input to command is JSON with name (suggested worktree slug).
Stdout should contain the absolute path to the created worktree directory.
Exit code 0 - worktree created successfully
Other exit codes - worktree creation failed`},WorktreeRemove:{summary:"Remove a previously created worktree",description:`Input to command is JSON with worktree_path (absolute path to worktree).
Exit code 0 - worktree removed successfully
Other exit codes - show stderr to user only`},CwdChanged:{summary:"After the working directory changes",description:`Input to command is JSON with old_cwd and new_cwd.
CLAUDE_ENV_FILE is set \u2014 write bash exports there to apply env to subsequent BashTool commands.
Hook output can include hookSpecificOutput.watchPaths (array of absolute paths) to register with the FileChanged watcher.
Exit code 0 - command completes successfully
Other exit codes - show stderr to user only`},FileChanged:{summary:"When a watched file changes",description:`Input to command is JSON with file_path and event (change, add, unlink).
CLAUDE_ENV_FILE is set \u2014 write bash exports there to apply env to subsequent BashTool commands.
The matcher field specifies filenames to watch in the current directory (e.g. ".envrc|.env").
Hook output can include hookSpecificOutput.watchPaths (array of absolute paths) to dynamically update the watch list.
Exit code 0 - command completes successfully
Other exit codes - show stderr to user only`},DirectoryAdded:{summary:"After a working directory is added mid-session",description:`Fires after /add-dir or the register_repo_root SDK control request registers a new working directory, after the sandbox configuration has been refreshed \u2014 so sandboxed tools and permission state already see the new directory (hook commands themselves run unsandboxed).
Input to command is JSON with directory (absolute path) and source ("slash_command" or "register_repo_root").
Exit code 0 - command completes successfully
Other exit codes - stderr is debug-logged on both paths; for /add-dir, a failure count is summarized to Claude and hook systemMessage output reaches Claude as bounded context; for register_repo_root, everything is debug-logged only`,matcherMetadata:{fieldToMatch:"source",values:["slash_command","register_repo_root"]}},MessageDisplay:{summary:"While assistant message text is displayed",description:`Input to command is JSON with turn_id, message_id, index, final, and delta (the newly completed lines).
Output JSON with hookSpecificOutput containing displayContent to replace the delta on screen.
Display-only: the stored message and what the model sees are untouched.
Exit code 0 - use hook response if provided
Other exit codes - display the original delta`}}}function $in(e,n){let t=Object.create(null);for(let o of kc)t[o]=Object.create(null);let i=zFt(n);odi(e).forEach((o)=>{let s=t[o.event];if(s){let r=i[o.event].matcherMetadata!==void 0?o.matcher||"":"";if(!s[r])s[r]=[];s[r].push(o)}});let c=JR();if(c)for(let[o,s]of Object.entries(c)){let r=o,d=t[r];if(!d)continue;for(let a of s){let l=a.matcher||"";if("pluginRoot"in a){d[l]??=[];for(let u of a.hooks)d[l].push({event:r,config:u,matcher:a.matcher,source:"pluginHook",pluginName:a.pluginId})}}}return t}function KQe(e,n){let t=Object.keys(e[n]||{});return sdi(t,e,n)}function PTo(e,n,t){let i=t??"";return e[n]?.[i]??[]}
export{zFt,$in,KQe,PTo};
