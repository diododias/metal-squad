import type { Tool } from '../backlog/schema.js';
import type { ToolAdapter } from './types.js';
import { claudeAdapter } from './claude.js';
import { codexAdapter } from './codex.js';
import { opencodeAdapter } from './opencode.js';

const registry: Record<Tool, ToolAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
};

export function getAdapter(tool: Tool): ToolAdapter {
  return registry[tool];
}
