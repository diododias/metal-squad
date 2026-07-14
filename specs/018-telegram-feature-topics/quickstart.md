# Quickstart: F54 - Tópico de Telegram por Feature

## Prerequisites

- Run from `/Users/luizdiodo/new_repos/metal-squad`.
- Install dependencies if needed and use a writable isolated database:

```bash
export MSQ_DB_PATH="$(pwd)/.metal-squad/telegram-topics-validation.db"
rtk npm install
rtk npm run build
```

- The focused tests mock `fetch`, so no real Telegram chat is required for the
  deterministic validation. For live validation, use a bot administrator in a
  forum-enabled supergroup and store `telegram-bot-token` in the existing
  keychain location.

## Scenario 1: First notification creates and targets one feature topic

1. Configure one Telegram channel with the supergroup chat ID and enable a
   feature-linked event.
2. Run the focused topic/channel tests with mocked `getChat`,
   `createForumTopic`, and `sendMessage` responses.
3. Send two notifications for `F54` and one for a second feature.

Expected result: `getChat` accepts the forum supergroup, one topic is created
for each feature, every message payload contains only its own returned
`message_thread_id`, and the SQLite association table contains one active row
per feature.

## Scenario 2: Restart, retry, and concurrent first events reuse the association

1. Seed or create an active association for one feature.
2. Re-import/restart the notification module and send another event.
3. Run two first-event sends concurrently for a new feature.

Expected result: the existing feature causes no second `createForumTopic` call;
the concurrent first events produce one authoritative association and one
effective topic; subsequent messages use that same thread.

## Scenario 3: Invalid destination and unavailable topic fail safely

1. Mock `getChat` as a regular group or a supergroup with `is_forum: false`.
2. Attempt a first feature notification.
3. Mock a stored thread failure (for example, Telegram's thread-not-found
   response), then mock successful topic creation and delivery.

Expected result: the incompatible case sends no feature message and persists
an actionable error. The unavailable-thread case invalidates and recovers the
same feature association, retries the original message once, and never sends it
to another feature's or General topic.

## Scenario 4: Interactive responses remain in the feature context

1. Create a pending gate/stage request and an active topic association.
2. Feed the poller a matching message or callback update.
3. Feed it the same command from another topic and another chat.

Expected result: the matching update resolves the original pending request;
the mismatched updates are acknowledged when applicable but do not alter any
gate, stage request, or pipeline.

## Scenario 5: Legacy/global notifications remain compatible

1. Configure the existing `telegramChatId` or static `forumTopicId` route.
2. Dispatch a notification without `featureId`, alongside a feature-linked
   notification.

Expected result: the global message uses the pre-existing destination, while
the feature-linked message uses its dynamic association. No topic association
is created for the global message.

## Validation commands

```bash
rtk npx vitest run \
  tests/core/notify-telegram.test.ts \
  tests/core/notify-telegram-topics.test.ts \
  tests/core/notify-telegram-poller.test.ts \
  tests/core/events-notifications.test.ts \
  tests/db/telegram-topics.test.ts \
  tests/config/notifications.test.ts
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

For live evidence, inspect both the captured/real Bot API requests and the
isolated SQLite association/error rows. The relevant contract and entities are
documented in [telegram-topic-routing-contract.md](contracts/telegram-topic-routing-contract.md)
and [data-model.md](data-model.md).
