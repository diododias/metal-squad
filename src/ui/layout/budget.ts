import type { LayoutMode } from '../format.js';

export interface ChromeConfig {
  layoutMode: LayoutMode;
  hasGateFooter: boolean;
  gateCount: number;
  hasGatePrompt: boolean;
  hasStatusHints: boolean;
  hasThemeNotice: boolean;
}

/** Lines consumed by the fixed header area (margins + HeaderBar + optional StatsBar). */
const HEADER_HEIGHT = 3;
const HEADER_STACKED_EXTRA = 1;

/** Lines consumed by the status bar border + summary line. */
const STATUS_BAR_BASE = 3;
const STATUS_BAR_HINTS_EXTRA = 1;
const STATUS_BAR_NOTICE_EXTRA = 1;

/** Command bar content + top margin. */
const COMMAND_BAR_HEIGHT = 2;

/** MainPanel top/bottom borders + title line. Content goes on top of this. */
export const MAIN_PANEL_CHROME_HEIGHT = 3;

/** GateFooter border top/bottom + title + instructions. */
const GATE_FOOTER_BASE = 4;
const GATE_FOOTER_PER_GATE = 1;
const GATE_FOOTER_PROMPT_EXTRA = 1;

const DEFAULT_MIN_CONTENT_HEIGHT = 8;

export function getChromeHeight(config: ChromeConfig): number {
  let height = HEADER_HEIGHT + (config.layoutMode === 'stacked' ? HEADER_STACKED_EXTRA : 0);
  height += STATUS_BAR_BASE;
  if (config.hasStatusHints) height += STATUS_BAR_HINTS_EXTRA;
  if (config.hasThemeNotice) height += STATUS_BAR_NOTICE_EXTRA;
  height += COMMAND_BAR_HEIGHT;

  if (config.hasGateFooter) {
    height += GATE_FOOTER_BASE;
    height += Math.min(config.gateCount, 3) * GATE_FOOTER_PER_GATE;
    if (config.hasGatePrompt) height += GATE_FOOTER_PROMPT_EXTRA;
  }

  return height;
}

export function getMainPanelContentHeight(
  terminalHeight: number,
  chromeHeight: number,
  minContent = DEFAULT_MIN_CONTENT_HEIGHT,
): number {
  return Math.max(minContent, terminalHeight - chromeHeight - MAIN_PANEL_CHROME_HEIGHT);
}
