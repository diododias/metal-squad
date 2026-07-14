# Data Model: F54 - Tópico de Telegram por Feature

## Entity: FeatureTopicAssociation

**Description**: The durable routing record for one feature in one configured
Telegram chat.

**Fields**:

- `chatId: string` — Telegram chat identifier, stored as text to avoid numeric
  precision issues.
- `featureId: string` — stable Metal Squad feature identity.
- `threadId: number | null` — Telegram `message_thread_id`; null while creation
  is reserved or after an invalidation.
- `title: string` — initial sanitized topic title; it is not recomputed after
  an administrator renames the topic.
- `state: 'creating' | 'active' | 'invalid' | 'error'`.
- `leaseToken: string | null` and `leaseExpiresAt: string | null` — bounded
  reservation data for concurrent/crashed creators.
- `lastError: string | null` — actionable API/config/delivery failure with
  feature, chat, operation, and Telegram error context.
- `createdAt: string`, `updatedAt: string`.

**Constraints**:

- Unique key `(chatId, featureId)`; there is at most one authoritative row.
- `threadId` is a positive integer whenever `state = 'active'`.
- A failed operation updates `lastError` and remains recoverable; it must not
  route the message to another association.

## Entity: FeatureTopicRequestContext

**Description**: The inbound Telegram context used to authorize an interactive
response.

**Fields**:

- `chatId: string` — originating message/callback chat.
- `threadId: number | null` — originating topic thread.
- `featureId: string` — feature obtained from the pending gate or stage request.
- `requestId: number` and `kind: 'gate' | 'stage'`.

**Validation rules**:

- The chat must equal the configured Telegram channel chat.
- The association for `chatId` and `featureId` must be active and its `threadId`
  must equal the incoming thread ID.
- A missing or mismatched context is ignored after best-effort callback
  acknowledgement; it cannot resolve a request.

## Entity: TelegramFeatureTopicConfig

**Description**: The existing notification configuration interpreted by the
feature-aware router.

**Fields**:

- `chatId: string` — required Telegram destination.
- `forumTopicId?: number` — existing static/general topic for no-feature
  messages and compatibility configurations.

**Behavior**:

- Dynamic feature routing is selected by `metadata.featureId`, not by a new
  per-channel flag.
- `telegramChatId` remains a legacy source normalized to a Telegram channel.
- Credentials and chat IDs remain redacted from web state as today.

## State transitions

```text
missing -> creating -> active
creating -> error              (validation/API failure or lease timeout)
active -> invalid              (thread unavailable/removed)
invalid -> creating -> active  (controlled recovery/recreation)
error -> creating -> active    (retry after configuration/access is fixed)
```

Creation and recovery update the existing unique row. They do not delete a
valid association, and no transition permits a feature message to use another
feature's `threadId`.

## Relationships

- One `FeatureTopicAssociation` belongs to one `(chatId, featureId)` pair.
- A `Gate` or pending `StageRequest` references a `featureId`; the poller joins
  that identity to the association before applying a response.
- Notification events carry the same opaque `featureId` in metadata; the
  Telegram channel resolves it to `threadId` while Slack, Discord, webhook,
  and desktop channels ignore the routing-specific metadata.
- Global/no-feature notifications have no association and continue through the
  configured static/general destination.

## Persistence boundary

The new table is created and migrated by `src/db/index.ts`; repository helpers
in `src/db/repo.ts` own reads, reservations, activation, invalidation, and
error recording. `src/core/notify/telegram-topics.ts` owns lifecycle policy but
does not issue ad hoc SQL outside the repository boundary.
