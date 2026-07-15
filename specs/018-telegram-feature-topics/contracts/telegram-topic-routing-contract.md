# Telegram Feature Topic Routing Contract

## Outbound notification contract

The notification manager may pass these optional metadata fields to channels:

```text
featureId: string       # stable feature identity; enables dynamic routing
featureName?: string    # display-only name used on first topic creation
requestId?: number      # interactive request context, when applicable
gateId?: number         # gate context, when applicable
stage?: string          # stage context, when applicable
reply_markup?: object   # existing Telegram inline keyboard payload
```

For a Telegram channel with `chatId` and `featureId`, the adapter MUST:

1. Resolve/create the active association for `(chatId, featureId)`.
2. Validate the configured chat as a forum supergroup before first creation.
3. Send every fragment with the resolved `message_thread_id`.
4. Preserve `reply_markup` only on the final fragment, as current behavior does.
5. Record failures with feature/chat/operation context and never fall back to a
   different feature topic or the General topic.

For a message without `featureId`, the adapter MUST retain the existing static
`forumTopicId` behavior. Other channels ignore the Telegram-specific routing
fields.

## Topic title contract

The initial name is a sanitized combination of the stable feature ID and name,
for example `F-ABC12345 — Telegram: Feature Topics`. Control characters and
repeated whitespace are removed. The stable ID is always retained, and the
complete title is at most 128 characters. Later feature-name changes or manual
topic renames do not change the association.

## Inbound response contract

The poller accepts an interactive command only when all conditions hold:

- the update originates in the configured Telegram chat;
- the update's `message_thread_id` matches the active association for the
  feature owning the referenced gate or stage request;
- the referenced request/gate is still pending/open.

Message commands retain their existing grammar:

```text
gate:<gateId> approve|skip|retry
stage:<requestId> advance|hold|retry
input:<requestId> <text>
input:<requestId>:<optionIndex>
resume_pipeline:<pipelineId>
```

Callback-query commands use the same `callback_data` grammar and the topic
context from `callback_query.message`. A mismatched or missing context is
acknowledged when possible but produces no state mutation.

## Error contract

Errors are actionable and include:

- incompatible destination: expected a forum-enabled supergroup and a bot with
  topic-management permission;
- create/recovery failure: Telegram operation and returned error;
- delivery failure: feature, chat, thread, and operation;
- inbound mismatch: request/gate ID plus the reason the chat/topic did not
  match.

The error is persisted in the feature-topic association when a feature identity
exists. Notification dispatch remains isolated per channel, so a Telegram
failure does not fail unrelated Slack, Discord, webhook, or desktop delivery.

## Implementation Traceability

The outbound rules are implemented by `telegram-topics.ts` and `telegram.ts`,
the metadata boundary by `events/types.ts` and `events/notifications.ts`, and
the inbound rules by `telegram-poller.ts` plus the association repository.
Focused tests cover forum validation, one-topic idempotency, fragment payloads,
controlled recovery, channel isolation, and legacy routing.
