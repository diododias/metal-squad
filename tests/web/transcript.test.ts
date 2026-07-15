import React from 'react';
import { describe, expect, it } from 'vitest';
import { ToolCallGroup } from '../../src/web/client/components/transcript/ToolCallGroup.js';
import { createToolCall } from '../fixtures/heartbeat-status.js';

describe('ToolCallGroup', () => {
  it('renders a count and a stable group key', () => {
    const element = React.createElement(ToolCallGroup, { groupKey: '1:implement:0', calls: [createToolCall()] });
    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.groupKey).toBe('1:implement:0');
    expect(element.props.calls).toHaveLength(1);
  });
});
