/**
 * Versioned agent-output contract shared by every staged workflow prompt.
 * Keep the marker shapes aligned with `parseControlSignal`.
 *
 * Source of truth: this file. The skill at
 * `.claude/skills/msq-communication-protocol/SKILL.md` mirrors this content
 * for human/agent reading; if the two diverge, this code wins (the parser
 * here is what actually interprets control signals).
 */
export const COMMUNICATION_PROTOCOL = `# msq <-> agent communication protocol (v1)

End your final response with exactly one of these control signals:

- \`MSQ_DONE: <summary>\`
  On the next line, include the required publication fields exactly as:
  \`pr_url=<url> pr_number=<number> base=<base-branch> head=<head-branch>\`
- \`MSQ_INPUT_REQUIRED: <question>\`
  If the question has 1-8 discrete answer options, add \`OPTIONS:\` on the next line,
  followed by one \`- <label>\` line per option. Each label must be 1-60 characters
  and labels must be unique. Omit \`OPTIONS:\` for free-text input.
- \`MSQ_BLOCKED: <reason_code> | <reason>\`
  Use exactly one reason_code: \`dependency_unavailable\`, \`precondition_failed\`,
  \`environment_error\`, \`spec_ambiguous\`, or \`validation_failed\`.

Whenever this session generates any material — code, docs, specs, config —
push the branch and open a pull request against \`develop\` (or the declared
dependency base for a stacked PR) before declaring MSQ_DONE, unless this
stage is explicitly configured not to publish. Pushing and opening that PR
are pre-authorized for this session; do not pause to ask for confirmation.

Full contract, examples, and the do/don't list: skill /msq-communication-protocol.
Read it before ending your response.`;

/**
 * Full inline body of the communication protocol, including the
 * normative rules and the do/don't list from the skill. Used inplaces
 * where the agent has demonstrated it ignored the by-name reference
 * (single reinforcement turn) so the contract is presented verbatim
 * instead of asking the agent to decide whether to read the skill.
 */
export const COMMUNICATION_PROTOCOL_FULL = `# msq <-> agent communication protocol (v1) — full body

You MUST end your final response with exactly one control signal. Plain
questions, plain summaries, or any form of asking for confirmation outside
this protocol are NOT valid and will be treated as a protocol violation.

## Control signals

- \`MSQ_DONE: <summary>\`
  On the next line, include the publication fields exactly as:
  \`pr_url=<url> pr_number=<number> base=<base-branch> head=<head-branch>\`
  Missing those fields when the stage publishes is a validation failure,
  not partial success — finish the publication first, then declare MSQ_DONE.
- \`MSQ_INPUT_REQUIRED: <question>\`
  If the question has 1-8 discrete answer options, add \`OPTIONS:\` on the
  next line, followed by one \`- <label>\` line per option. Each label must
  be 1-60 characters and unique. Omit \`OPTIONS:\` for free-text input.
- \`MSQ_BLOCKED: <reason_code> | <reason>\`
  Use exactly one reason_code: \`dependency_unavailable\`, \`precondition_failed\`,
  \`environment_error\`, \`spec_ambiguous\`, or \`validation_failed\`.

## Mandatory rules

1. End every final response with EXACTLY ONE control signal. Never end with
   a natural-language question, a signal-less summary, or any other form of
   asking for confirmation outside this protocol.
2. \`git push\` and opening a pull request are PRE-AUTHORIZED for this
   headless session. Do not pause to ask for confirmation before pushing or
   opening a PR — that authorization is implied by the session being
   launched by msq. Asking for it in prose is itself a protocol violation.
3. Whenever this session generates any material (code, docs, specs, ADRs,
   config), push the branch and open a PR against \`develop\` (or the
   declared dependency base for a stacked PR) before declaring MSQ_DONE,
   unless this stage is explicitly configured not to publish.
4. \`MSQ_DONE\` without the required publication fields (when the stage
   publishes) is a validation failure, not success.
5. If you receive this reinforcement turn, your previous response violated
   rule 1. Do NOT repeat the prose question: if the work is already done
   (including push/PR), declare \`MSQ_DONE\` now; if you are genuinely stuck
   or need a human decision, use \`MSQ_BLOCKED\` or \`MSQ_INPUT_REQUIRED\`.

## Do NOT

- Do NOT end the final response with "Want me to proceed?", "Can I push
  now?" or equivalent — that is not a valid control signal and msq cannot
   interpret it.
- Do NOT assume push/PR need human approval inside this session.
- Do NOT declare \`MSQ_DONE\` with unpublished material when the stage
  publishes.
- Do NOT invent a new signal format; use exactly the syntax above.`;

/**
 * Sent as a single follow-up turn, in the same resumed session, when a run
 * finishes without any control signal above. Keep it short: the agent has
 * already paid for full task context, this only needs to correct course.
 *
 * The full body is inlined (not just referenced by name) because we already
 * have evidence the by-name reference is ignored — the agent has to decide
 * to read it, and at this point it already chose not to.
 */
export const PROTOCOL_REINFORCEMENT_PROMPT = `In the last message you sent, you did not respect the communication protocol. Follow it now: read the full contract below and close this turn the way it requires.

Your previous response ended without declaring one of the control signals. If you already finished the requested work in this session — including any push or pull request the task asked for — no further confirmation is needed: this session already authorizes it, so proceed and declare MSQ_DONE now. If you are genuinely stuck, use MSQ_INPUT_REQUIRED or MSQ_BLOCKED instead. Do not end this response with a plain-language question in place of a control signal.

${COMMUNICATION_PROTOCOL_FULL}`;