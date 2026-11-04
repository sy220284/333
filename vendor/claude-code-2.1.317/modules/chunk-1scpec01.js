// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{T9,q}from"./chunk-wxyh2ndv.js";import{un}from"./chunk-yx0yvz1d.js";import{i}from"./chunk-jdmxbspc.js";import{M}from"./chunk-sctdt2my.js";import{pn}from"./chunk-sxtzjrdg.js";import{Ne}from"./chunk-tm88cq46.js";import{Yh,g3e,DBe}from"./chunk-1cetzd2p.js";import{$Fe}from"./chunk-nyw29gxv.js";import{ND}from"./chunk-d7w6q8s6.js";import{Ns}from"./chunk-vfm8bhss.js";var Ga="TaskStop",hlr=["KillShell","KillBash"],dgi=`
- Stops a running background task by its ID
- Takes a task_id parameter identifying the task to stop
- To stop an agent-team teammate, pass its agent ID or bare teammate name as task_id
- To stop a background agent spawned with a name, pass that name as task_id
- Returns a success or failure status
- Use this tool when you need to terminate a long-running task
`;var AYe=300000,Qvn=3600000,n=1800000,a=600000;function KPe(){return T9()||q()?a:n}var l="[Monitor timed out \u2014 re-arm if needed.]";function _ae(){return q()||un("tengu_breezy_crescent",!0)}function cit(e){return`${Math.round(e/60000)} minutes`}function cgi(e,t){if(t)return{timeout_ms:Math.min(e.timeout_ms,KPe()),persistent:!1};let o=e.persistent===!0;if(!i.CLAUDE_CODE_REMOTE)return{timeout_ms:e.timeout_ms,persistent:o};return{timeout_ms:o?n:Math.min(e.timeout_ms,n),persistent:!1}}function xJr(e,t,o){if(!o)return Yh()?"[Monitor timed out. Re-arm it only if you have more to do before you reply; a few minutes after your reply a new watch is likely stopped, so tell the user what to check instead.]":l;let r=pn(e,{hideTrailingZeros:!0}),s=q()?"Re-arm it only if you have more to do before you reply; after your reply a new watch may stop within a minute, so tell the user what to check instead":Yh()?"Re-arm it only if you have more to do before you reply; a few minutes after your reply a new watch is likely stopped, so tell the user what to check instead":"Re-arm it if you still need the watch";if(t===0)return`[Monitor expired after ${r} with no events delivered. ${s} \u2014 and widen the filter if silence was unexpected.]`;return`[Monitor expired after ${r} with ${t} ${M(t,"event")} delivered. ${s}.]`}function D7o(){return $Fe()?`

When an event lands that the user would want to act on now \u2014 an error appeared, the status they were waiting on flipped \u2014 send a ${ND}. Not every event is worth a push; the ones that change what they'd do next are.`:""}function L7o(){let e=DBe()||q()||Yh(),t='- **One** ("tell me when the server is ready / the build finishes") \u2192 '+(e?'run the command in the **foreground with Bash**, exiting when the condition is true, e.g. `until grep -q "Ready in" dev.log; do sleep 0.5; done`.':'use **Bash with `run_in_background`** and a command that exits when the condition is true, e.g. `until grep -q "Ready in" dev.log; do sleep 0.5; done`. You get a single completion notification when it exits.'),o=e?"use a foreground Bash `until` loop instead":"use Bash `run_in_background` with an `until` loop instead (one notification, ends in seconds)";return`Start a background monitor that streams events from a long-running script. Each stdout line is an event \u2014 you keep working and notifications arrive in the chat. Events arrive on their own schedule and are not replies from the user, even if one lands while you're waiting for the user to answer a question.${q()?` ${u}`:Yh()?` ${h} ${g3e()?`To wait past your reply, have a background agent wait with foreground ${Ne} commands, or tell the user what to check and when.`:"For anything longer, tell the user what to check and when."}`:""}

Pick by how many notifications you need:
${t}
${q()||Yh()?`- **One per occurrence, while you work on this turn** ("show each ERROR line in the dev server's log while you try the change") \u2192 ${Ns} with an unbounded command (\`tail -f\`, \`inotifywait -m\`, \`while true\`).
- **One per occurrence, until a known end, while you work on this turn** ("show each test file's result as the suite you just started runs, stop when it ends") \u2192 ${Ns} with a command that emits lines and then exits.`:`- **One per occurrence, ${_ae()?"until the monitor expires (re-arm to continue)":"indefinitely"}** ("tell me every time an ERROR line appears") \u2192 Monitor with an unbounded command (\`tail -f\`, \`inotifywait -m\`, \`while true\`).
- **One per occurrence, until a known end** ("emit each CI step result, stop when the run completes") \u2192 Monitor with a command that emits lines and then exits.`}

Your script's stdout is the event stream. Each line becomes a notification. Exit ends the watch.

  # Each matching log line is an event
  tail -f /var/log/app.log | grep --line-buffered "ERROR"

  # Each file change is an event
  inotifywait -m --format '%e %f' /watched/dir

  # Poll GitHub for new PR comments and emit one line per new comment
  last=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  while true; do
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    gh api "repos/owner/repo/issues/123/comments?since=$last" --jq '.[] | "\\(.user.login): \\(.body)"'
    last=$now; sleep 30
  done

  # Node script that emits events as they arrive (e.g. WebSocket listener)
  node watch-for-events.js

  # Per-occurrence with a natural end: emit each CI check as it lands, exit when the run completes
  prev=""
  while true; do
    s=$(gh pr checks 123 --json name,bucket)
    cur=$(jq -r '.[] | select(.bucket!="pending") | "\\(.name): \\(.bucket)"' <<<"$s" | sort)
    comm -13 <(echo "$prev") <(echo "$cur")
    prev=$cur
    jq -e 'all(.bucket!="pending")' <<<"$s" >/dev/null && break
    sleep 30
  done

**Don't use an unbounded command for a single notification.** \`tail -f\`, \`inotifywait -m\`, and \`while true\` never exit on their own, so the monitor stays armed until timeout even after the event has fired. For "tell me when X is ready," ${o}. Note that \`tail -f log | grep -m 1 ...\` does *not* fix this: if the log goes quiet after the match, \`tail\` never receives SIGPIPE and the pipeline hangs anyway.

**Script quality:**
- Every pipe stage must flush per line or matches sit in its buffer unseen: \`grep\` needs \`--line-buffered\`, \`awk\` needs \`fflush()\`. \`head\` cannot flush at all \u2014 \`| head -N\` delivers nothing until N matches accumulate, then ends the stream.
- In poll loops, handle transient failures (\`curl ... || true\`) \u2014 one failed request shouldn't kill the monitor.
- Poll intervals: 30s+ for remote APIs (rate limits), 0.5-1s for local checks.
- Write a specific \`description\` \u2014 it appears in every notification ("errors in deploy.log" not "watching logs").
- Only stdout is the event stream. Stderr goes to the output file (readable via Read) but does not trigger notifications \u2014 for a command you run directly (e.g. \`python train.py 2>&1 | grep --line-buffered ...\`), merge stderr with \`2>&1\` so its failures reach your filter. (No effect on \`tail -f\` of an existing log \u2014 that file only contains what its writer redirected.)

**Coverage \u2014 silence is not success.** When watching a job or process for an outcome, your filter must match every terminal state, not just the happy path. A monitor that greps only for the success marker stays silent through a crashloop, a hung process, or an unexpected exit \u2014 and silence looks identical to "still running." Before arming, ask: *if this process crashed right now, would my filter emit anything?* If not, widen it.

  # Wrong \u2014 silent on crash, hang, or any non-success exit
  tail -f run.log | grep --line-buffered "elapsed_steps="

  # Right \u2014 one alternation covering progress + the failure signatures you'd act on
  tail -f run.log | grep -E --line-buffered "elapsed_steps=|Traceback|Error|FAILED|assert|Killed|OOM"

For poll loops checking job state, emit on every terminal status (\`succeeded|failed|cancelled|timeout\`), not just success. If you cannot confidently enumerate the failure signatures, broaden the grep alternation rather than narrow it \u2014 some extra noise is better than missing a crashloop.

**Output volume**: Every stdout line is a conversation message, so the filter should be selective \u2014 but selective means "the lines you'd act on," not "only good news." Never pipe raw logs; filter to exactly the success and failure signals you care about. Monitors that produce too many events are automatically stopped; restart with a tighter filter if this happens.

Stdout lines within 200ms are batched into a single notification, so multiline output from a single event groups naturally.

The script runs in the same shell environment as Bash. Exit ends the watch (exit code is reported). ${c()} Use TaskStop to cancel early.`}var u=`In this session a monitor can be counted on only while you are working. After your reply it may stop at any time, often within a minute, and you are told so with the user's next message. To wait for one thing before you answer, run a foreground ${Ne} command that exits when it happens; for anything longer, tell the user what to check and when.`,h=`In this session a monitor can be counted on only while you are working: a few minutes after your reply it is likely stopped along with every other process left running here, and you may hear nothing more from it, not even that it stopped, until the user writes again. To wait for one thing before you answer, run a foreground ${Ne} command that exits when it happens.`;function c(){if(q())return`Every monitor expires after \`timeout_ms\` (default ${cit(AYe)}, at most ${cit(KPe())}): it is killed and you get one notice with the event count. If it stops after your reply and before it expires, you learn only that it stopped, with the user's next message.`;if(Yh())return`${_ae()?`Every monitor expires after \`timeout_ms\` (default ${cit(AYe)}, at most ${cit(KPe())}): it is killed and you get one notice with the event count.`:"Timeout \u2192 killed."} Any monitor is also likely stopped a few minutes after your reply, and you may hear nothing of that until the user writes again.`;return _ae()?`Every monitor expires after \`timeout_ms\` (default ${cit(AYe)}, at most ${cit(KPe())}): it is killed and you get one notice with the event count. Re-arm it if you still need the watch; for a long watch (PR monitoring, log tails) set \`timeout_ms\` to the maximum and re-arm on each expiry, and widen the filter if an expiry with no events was unexpected.`:"Timeout \u2192 killed. Set `persistent: true` for session-length watches (PR monitoring, log tails) \u2014 the monitor runs until you call TaskStop or the session ends."}var H7o=`
**ws source** \u2014 open a WebSocket and stream each incoming text frame as an event. No shell, no polling: the server pushes, you get notified.

  Monitor({
    ws: {url: 'wss://events.example.com/stream', protocols: ['v1']},
    description: 'deploy events',
  })

Each text frame becomes one notification (multiline frames stay as one event). Binary frames are reported as \`[binary frame, N bytes]\` rather than passed through. Socket close ends the watch with the close code surfaced; errors are surfaced before close. Same rate limiting as bash \u2014 a firehose will be suppressed and eventually stopped, so subscribe to a filtered feed where one exists.

Prefer this over \`command: 'websocat wss://\u2026'\` \u2014 it avoids the extra process and line-buffering pitfalls. Use bash when you need to transform or filter frames with shell tools before they become events.`;
export{Ga,hlr,dgi,AYe,Qvn,KPe,_ae,cit,cgi,xJr,D7o,L7o,H7o};
