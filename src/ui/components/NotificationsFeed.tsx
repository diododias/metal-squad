import React from 'react';
import { Box, Text } from 'ink';
import { truncateText } from '../format.js';
import type { NotificationEntry } from '../hooks/useNotifications.js';
import { useTheme } from '../theme/context.js';
import { getNotificationTone } from '../theme/styles.js';

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
  const theme = useTheme();
  const visible = notifications.slice(0, maxVisible);
  const hiddenCount = Math.max(0, notifications.length - visible.length);
  const contentWidth = Math.max(18, width - 4);

  return (
    <Box flexDirection="column" width={width}>
      {visible.length === 0 ? (
        <Text {...theme.role('muted')}>No recent notifications.</Text>
      ) : (
        visible.map((notification) => (
          <Box
            key={notification.id}
            flexDirection="column"
            marginBottom={compact ? 0 : 1}
            width={width}
          >
            <Text {...theme.role('muted')}>
              {notification.ts}  {EVENT_LABEL[notification.event] ?? notification.event.toUpperCase()}
            </Text>
            <Text {...theme.notificationTone(getNotificationTone(notification.event))}>
              {compact ? truncateText(notification.message, contentWidth) : notification.message}
            </Text>
          </Box>
        ))
      )}
      {compact && hiddenCount > 0 && (
        <Text {...theme.role('muted')}>+{hiddenCount} more. Press o to open the full feed.</Text>
      )}
    </Box>
  );
}
