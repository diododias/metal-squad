# Research: F54 - Tópico de Telegram por Feature

## Decision: Use the Telegram Bot API forum-topic lifecycle

**Rationale**:

- `getChat` exposes the destination type and `is_forum`, which gives an
  actionable compatibility check before the first feature topic is created.
- `createForumTopic` returns the topic's `message_thread_id`; subsequent
  `sendMessage` calls can target that ID explicitly.
- The bot must be an administrator with topic-management permission in a forum
  supergroup, so the error path can tell the operator exactly what to fix.
- Topic names are limited to 128 characters and message text to 4096
  characters, matching the constraints already handled by `TelegramChannel`.

**Alternatives considered**:

- Sending every feature to the configured `forumTopicId`: rejected because it
  mixes features and cannot satisfy one-topic-per-feature isolation.
- Using Telegram's MTProto topic-list APIs: rejected because this project uses
  the HTTP Bot API and should not add a second protocol/client dependency.
- Treating a regular group or the General topic as compatible: rejected because
  it silently loses the feature boundary.

References: [Telegram Bot API](https://core.telegram.org/bots/api),
[`getChat`](https://core.telegram.org/bots/api#getchat),
[`createForumTopic`](https://core.telegram.org/bots/api#createforumtopic), and
[`sendMessage`](https://core.telegram.org/bots/api#sendmessage).

## Decision: Persist an association keyed by chat and feature

**Rationale**:

- The existing config stores only a chat and optional static topic; it has no
  durable place to remember dynamic topics across restarts.
- SQLite is already the runtime persistence boundary and supports a unique
  `(chat_id, feature_id)` constraint, making the association independent of
  process memory.
- The row can retain `last_error` and a lifecycle state so failed creation,
  recovery, and delivery are diagnosable and retryable.
- A reservation/lease plus a per-process mutex handles concurrent first events;
  the unique row ensures only one association is authoritative.

**Alternatives considered**:

- Store the topic ID only in config: rejected because feature cardinality and
  lifecycle are dynamic and config writes would race with runtime events.
- Keep a process-local map: rejected because a restart would recreate topics
  and separate `msq` processes would not share it.
- Add a generic notification-delivery subsystem: rejected for this feature's
  scope; the association/error state is sufficient and can later be generalized
  without changing the routing contract.

## Decision: Resolve before delivery and retry only controlled thread failures

**Rationale**:

- Resolving before `sendMessage` means the first feature notification creates
  the topic and is routed correctly.
- A stored thread can become unavailable after manual deletion or a topic
  lifecycle change. The resolver can invalidate the association, recover or
  recreate it, update the same row, and retry the original message once.
- Other API errors must remain errors; retrying them or falling back to another
  topic could duplicate messages or violate isolation.

**Alternatives considered**:

- Always create a replacement topic after any failed send: rejected because
  transient network/auth errors would create duplicates and hide the cause.
- Fall back to General or the configured static topic: rejected by FR-005 and
  FR-008 because it can mix feature notifications.
- Reclassify historical messages: rejected because Telegram history cannot be
  safely rewritten by this feature and adoption must be forward-only.

## Decision: Validate inbound commands using the originating topic

**Rationale**:

- Telegram updates include the chat and `message_thread_id` for topic messages;
  callback queries include the originating message context.
- A gate or stage request already has a feature ID in SQLite. Looking up its
  association before resolving ensures a command from another feature's topic
  cannot mutate the request.
- Invalid-context callbacks can still be acknowledged to avoid a stuck client
  spinner, while no gate/request state changes.

**Alternatives considered**:

- Trust only the numeric request ID: rejected because a copied command could be
  issued from any chat/topic and would bypass the requested context boundary.
- Add feature IDs to every command string: rejected as the sole guard because
  it is user-editable; topic metadata is the authoritative context.
- Ignore all inbound topic metadata: rejected because it would preserve the
  current cross-feature ambiguity.

## Decision: Keep no-feature notifications backward compatible

**Rationale**:

- Global alerts have no feature identity and cannot be assigned safely to a
  feature topic.
- Existing `telegramChatId` normalization and static `forumTopicId` behavior
  remain the compatibility route for those messages.
- Dynamic topic routing is activated only when dispatch metadata contains a
  feature ID, so other channels and legacy behavior do not change.

**Alternatives considered**:

- Force all messages into per-feature topics: rejected because it would invent
  ownership for global alerts and break legacy configuration.
- Require a new opt-in flag: rejected because the requested feature describes
  the new behavior as the default for feature-linked notifications and an
  extra migration switch would leave ambiguous mixed routing.
