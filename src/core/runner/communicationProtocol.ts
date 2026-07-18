/**
 * Versioned agent-output contract shared by every staged workflow prompt.
 * Keep the marker shapes aligned with `parseControlSignal`.
 */
export const COMMUNICATION_PROTOCOL = `# msq ↔ agent communication protocol (v1)

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
  \`environment_error\`, \`spec_ambiguous\`, or \`validation_failed\`.`;

/**
 * Sent as a single follow-up turn, in the same resumed session, when a run
 * finishes without any control signal above. Keep it short: the agent has
 * already paid for full task context, this only needs to correct course.
 */
export const PROTOCOL_REINFORCEMENT_PROMPT = `Your previous response ended without declaring one of the control signals below. If you already finished the requested work in this session — including any push or pull request the task asked for — no further confirmation is needed: this session already authorizes it, so proceed and declare MSQ_DONE now. If you are genuinely stuck, use MSQ_INPUT_REQUIRED or MSQ_BLOCKED instead. Do not end this response with a plain-language question in place of a control signal.

${COMMUNICATION_PROTOCOL}`;
