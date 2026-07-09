import React from 'react';
import { Box, Text } from 'ink';
import type { ToastEntry } from '../hooks/useToasts.js';
import { truncateText } from '../format.js';
import { useTheme } from '../theme/context.js';

interface Props {
  toasts: ToastEntry[];
  width: number;
}

export function ToastStack({ toasts, width }: Props): React.ReactElement | null {
  const theme = useTheme();
  if (toasts.length === 0) return null;

  const toastWidth = Math.max(36, Math.min(width - 4, 72));

  return (
    <Box position="absolute" flexDirection="column" marginTop={1} marginLeft={Math.max(0, width - toastWidth - 4)}>
      {toasts.map((toast) => (
        <Box
          key={`${toast.event}:${String(toast.id)}`}
          borderStyle="round"
          borderColor={theme.notificationTone(toast.tone).color ?? theme.surface.borderColor}
          flexDirection="column"
          paddingX={1}
          marginBottom={1}
          width={toastWidth}
        >
          <Text {...theme.notificationTone(toast.tone)} bold>
            {toast.event.toUpperCase()}
          </Text>
          <Text {...theme.role('text')}>
            {truncateText(toast.message, toastWidth - 4)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
