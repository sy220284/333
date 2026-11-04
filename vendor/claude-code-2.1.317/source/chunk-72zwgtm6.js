// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var _Ct="ProposeGoal",dlr=500,Zmi="Propose a session goal condition, with one-keypress user approval; once set, Claude keeps working until a separate evaluator confirms it is met",egi=`Propose a completion condition for this session's work \u2014 a goal that keeps you working until a separate evaluator confirms it is met. Non-blocking: the proposal renders alongside your work, so keep working while it is handled.

ask_user true (the default) asks the user first, with a one-keypress approval dialog. If they decline you will not be notified \u2014 do not ask about the decision and do not re-propose the same or a reworded condition. Set ask_user false \u2014 which sets the goal directly, with no dialog \u2014 ONLY when the user's own words in this conversation stated this outcome as what they want; if you inferred it from their intent or the task's shape \u2014 or are in doubt \u2014 ask. Either path confirms a set goal with a kickoff message; until that message arrives, no new goal is active.

Propose only when the user has asked for an outcome with a verifiable end state ("make the tests pass", "migrate every call site") and the work spans multiple turns. Not for one-off tasks, and never to widen scope: the condition must follow from their request.

The evaluator verifies the condition from the conversation alone \u2014 it cannot run commands or read files \u2014 so state one measurable end state with its check (e.g. "bun test exits 0"), in at most ${500} characters. One goal is active at a time; a newly approved or directly set proposal replaces the current one.`;
export{_Ct,dlr,Zmi,egi};
