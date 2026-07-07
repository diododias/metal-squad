import React from 'react';
import { Box, Text } from 'ink';
import { truncateText } from '../format.js';
import type { NotificationEntry } from '../hooks/useNotifications.js';

const EVENT_COLOR: Record<string, string> = {
  'run:start': 'cyan',
  'gate:created': 'yellow',
  'gate:resolved': 'yellow',
  'stage:request-created': 'magenta',
  'stage:request-resolved': 'magenta',
  'run:failed': 'red',
  'budget:alert': 'magenta',
  'run:done': 'green',
  'ui:info': 'cyan',
  'ui:notice': 'red',
};

const EVENT_LABEL: Record<string, string> = {
  'run:start': 'RUN',
  'gate:created': 'GATE',
  'gate:resolved': 'GATE',
  'stage:request-created': 'STAGE',
  'stage:request-resolved': 'STAGE',
  'run:failed': 'FAIL',
  'budget:alert': 'BUDGET',
  'run:done': 'DONE',
  'ui:info': 'INFO',
  'ui:notice': 'NOTICE',
};

interface Props {
  notifications: NotificationEntry[];
  maxVisible?: number;
  width: number;
  compact?: boolean;
}

export function NotificationsFeed({
  notifications,
  maxVisible = 5,
  width,
  compact = false,
}: Props): React.ReactElement {
  const visible = notifications.slice(0, maxVisible);
  const hiddenCount = Math.max(0, notifications.length - visible.length);
  const contentWidth = Math.max(18, width - 4);

  return (
    <Box flexDirection="column" width={width}>
      {visible.length === 0 ? (
        <Text dimColor>No recent notifications.</Text>
      ) : (
        visible.map((notification) => (
          <Box
            key={notification.id}
            flexDirection="column"
            marginBottom={compact ? 0 : 1}
            width={width}
          >
            <Text dimColor>
              {notification.ts}  {EVENT_LABEL[notification.event] ?? notification.event.toUpperCase()}
            </Text>
            <Text color={EVENT_COLOR[notification.event] ?? 'white'}>
              {compact ? truncateText(notification.message, contentWidth) : notification.message}
            </Text>
          </Box>
        ))
      )}
      {compact && hiddenCount > 0 && (
        <Text dimColor>+{hiddenCount} more. Press o to open the full feed.</Text>
      )}
    </Box>
  );
}
