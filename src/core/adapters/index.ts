import type { Tool } from '../backlog/schema.js';
import type { ToolAdapter } from './types.js';
import { resolveRuntimeConfig } from '../../config/index.js';
import { claudeAdapter } from './claude.js';
import { codexAdapter } from './codex.js';
import { opencodeAdapter } from './opencode.js';

const registry: Record<'claude' | 'codex' | 'opencode', ToolAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
};

export function getAdapter(tool: Tool, cwd = process.cwd()): ToolAdapter {
  const tools = resolveRuntimeConfig(cwd).tools;
  const registeredTool = tools.find((entry) => entry.id === tool);
  if (!registeredTool) {
    const available = tools.map((entry) => entry.id).sort();
    throw new Error(`Tool "${tool}" is not registered. Register it in config.tools or use one of: ${available.join(', ')}.`);
  }

  return registry[registeredTool.adapter];
}
