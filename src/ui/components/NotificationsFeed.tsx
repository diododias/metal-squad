import React from 'react';
import { Box, Text } from 'ink';
import type { NotificationEntry } from '../hooks/useNotifications.js';

const EVENT_COLOR: Record<string, string> = {
  'gate:created': 'yellow',
  'run:failed': 'red',
  'budget:alert': 'magenta',
  'run:done': 'green',
  'ui:notice': 'red',
};

interface Props {
  notifications: NotificationEntry[];
  maxVisible?: number;
}

export function NotificationsFeed({ notifications, maxVisible = 5 }: Props): React.ReactElement {
  const visible = notifications.slice(0, maxVisible);
  return (
    <Box flexDirection="column">
      {visible.length === 0 ? (
        <Text dimColor>sem notificacoes recentes</Text>
      ) : (
        visible.map((n) => (
          <Box key={n.id}>
            <Text dimColor>{n.ts} </Text>
            <Text color={EVENT_COLOR[n.event] ?? 'white'}>{n.message}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
