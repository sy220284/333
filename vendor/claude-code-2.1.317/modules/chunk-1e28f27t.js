// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Bp}from"./chunk-7m911gj4.js";var El="ScheduleWakeup",dit="<<autonomous-loop>>",NFe="<<autonomous-loop-dynamic>>";function mlr({preArmStatus:e,briefMode:t}){let o=t?`This session is in brief mode: plain response text is treated as unread \u2014 send the update via ${Bp} with \`status: 'proactive'\`; an update left in plain text or thinking never reaches the user.`:"This must be ordinary visible response text \u2014 the user cannot see your thinking/reasoning, so an update written only there is invisible to them.",s=e?` ${t?"Send":"Write"} it immediately BEFORE calling ${El} \u2014 on this model the turn ends as soon as that tool returns, so an update after the call never goes out.`:" Make it the last thing in the turn, then end the turn.";return`${o}${s}`}function glr({briefMode:e}){return e?`send the loop's outcome to the user via ${Bp} (\`status: 'proactive'\`) \u2014 plain response text is treated as unread in this session`:"write the loop's outcome for the user as ordinary visible response text"}var a=`Schedule when to resume work in /loop dynamic mode \u2014 the user invoked /loop without an interval, asking you to self-pace iterations of a specific task.

Do NOT schedule a short-interval wakeup to poll for background work you started \u2014 when harness-tracked work finishes, you are re-invoked automatically, so polling is wasted. Instead schedule a long fallback (1200s+) so the loop survives if the work hangs or never notifies. The exception is external work the harness cannot track (a CI run, a deploy, a remote queue) \u2014 there, pick a delay matched to how fast that state actually changes.

Pass the same /loop prompt back via \`prompt\` each turn so the next firing repeats the task. For an autonomous /loop (no user prompt), pass the literal sentinel \`${NFe}\` as \`prompt\` instead \u2014 the runtime resolves it back to the autonomous-loop instructions at fire time. (There is a similar \`${dit}\` sentinel for CronCreate-based autonomous loops; do not confuse the two \u2014 ${El} always uses the \`-dynamic\` variant.) To end the loop, call this tool with \`stop: true\` (omit every other field) \u2014 the loop ends immediately and no further wakeups fire.`,n=`## Picking delaySeconds

This session's requests use the default 5-minute Anthropic prompt-cache TTL. Sleeping past 300 seconds means the next wake-up reads your full conversation context uncached \u2014 slower and more expensive. So the natural breakpoints:

- **Under 5 minutes (60s\u2013270s)**: cache stays warm. Right for actively polling external state the harness can't notify you about \u2014 a CI run, a deploy, a remote queue.
- **5 minutes to 1 hour (300s\u20133600s)**: pay the cache miss. Right when there's no point checking sooner \u2014 waiting on something that takes minutes to change, genuinely idle, or as the long fallback heartbeat when something else is the primary wake signal.

**Don't pick 300s.** It's the worst-of-both: you pay the cache miss without amortizing it. If you're tempted to "wait 5 minutes," either drop to 270s (stay in cache) or commit to 1200s+ (one cache miss buys a much longer wait). Don't think in round-number minutes \u2014 think in cache windows.

For idle ticks with no specific signal to watch, default to **1200s\u20131800s** (20\u201330 min). The loop checks back, you don't burn cache 12\xD7 per hour for nothing, and the user can always interrupt if they need you sooner.

Think about what you're actually waiting for, not just "how long should I sleep." If you're polling a CI run that takes ~8 minutes, sleeping 60s burns the cache 8 times before it finishes \u2014 sleep ~270s twice instead.

The runtime clamps to [60, 3600], so you don't need to clamp yourself.`,i=`## Picking delaySeconds

This session's requests use a 1-hour Anthropic prompt-cache TTL, so effectively every allowed delay (the runtime clamps to [60, 3600]) wakes up with your conversation context still cached. There is no cache cliff inside that range to pace around, and scheduling extra wakeups just to keep the cache warm is pure waste \u2014 never do that. (If the session enters usage overage, later requests drop to the 5-minute TTL; don't try to track or preempt that \u2014 the guidance here stays the same.)

Match the delay to what you're actually waiting for:

- **Actively polling external state the harness can't notify you about** (a CI run, a deploy, a remote queue): pick the delay from how fast that state actually changes. A CI run that takes ~8 minutes deserves one ~480s check, not eight 60s ones.
- **The long fallback heartbeat** (something else \u2014 a Monitor, a task notification \u2014 is the primary wake signal): 1200s+, so quiet wakeups stay rare.
- **Idle ticks with no specific signal to watch**: default to **1200s\u20131800s** (20\u201330 min). The loop still checks back regularly, and the user can always interrupt if they need you sooner.

Don't think in cache windows \u2014 think about what you're actually waiting for.`,r=`## Picking delaySeconds

The Anthropic prompt cache decides how expensive a wake-up is: waking inside the cache TTL re-reads your conversation context cached (fast, cheap); waking past it re-reads everything uncached. The TTL depends on how the session is billed: Claude subscriber sessions get a 1-hour TTL (dropping to 5 minutes during usage overage), while API-key, Bedrock, and Vertex sessions default to 5 minutes.

In either regime: never schedule extra wakeups just to keep the cache warm \u2014 they cost more than the cache miss they avoid. Match the delay to what you're actually waiting for: when actively polling external state the harness can't notify you about (a CI run, a deploy, a remote queue), pick the delay from how fast that state actually changes; for idle ticks with no specific signal to watch, default to **1200s\u20131800s** (20\u201330 min) \u2014 the user can always interrupt if they need you sooner.

On a 5-minute TTL only, two refinements: under 300s (60s\u2013270s) the cache stays warm, so prefer 270s over 300s when actively polling (300s is the worst-of-both \u2014 you pay the miss without amortizing it); and commit to 1200s+ rather than repeated ~300s waits, so one cache miss buys a long wait.

The runtime clamps to [60, 3600], so you don't need to clamp yourself.`,h=`## The reason field

One short sentence on what you chose and why. Goes to telemetry and is shown back to the user. "watching CI run" beats "waiting." The user reads this to understand what you're doing without having to predict your cadence in advance \u2014 make it specific.`,u='Set `noop: true` if nothing changed \u2014 you checked and there\'s nothing to report ("no change", "still waiting", "quiet hold"). Set `noop: false` if something happened worth keeping \u2014 you edited a file, posted a message, advanced state, or surfaced a finding. Consecutive `noop: true` ticks are collapsed in the user\'s terminal view and tracked as a streak, so long quiet holds stay legible to the user without scrolling. Omit `noop` when stopping (`stop: true`).';function agi(e){return`${a}

${u}

${e===!0?i:e===!1?n:r}

${h}
`}var lgi="Schedule when to resume work in /loop dynamic mode (always pass the `prompt` arg unless stopping). Call before ending the turn to keep the loop alive; call with `stop: true` to end the loop immediately.";var bx="TaskList";
export{El,dit,NFe,mlr,glr,agi,lgi,bx};
