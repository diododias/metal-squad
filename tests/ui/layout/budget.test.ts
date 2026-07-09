import { describe, expect, it } from 'vitest';
import {
  getChromeHeight,
  getMainPanelContentHeight,
  MAIN_PANEL_CHROME_HEIGHT,
} from '../../../src/ui/layout/budget.js';

describe('layout/budget', () => {
  it('calculates chrome for the simplest full layout', () => {
    const chrome = getChromeHeight({
      layoutMode: 'full',
      hasGateFooter: false,
      gateCount: 0,
      hasGatePrompt: false,
      hasStatusHints: true,
      hasThemeNotice: false,
    });
    expect(chrome).toBe(3 + 3 + 1 + 2); // header + status base + hints + command bar
  });

  it('adds the stacked StatsBar line for stacked mode', () => {
    const full = getChromeHeight({
      layoutMode: 'full',
      hasGateFooter: false,
      gateCount: 0,
      hasGatePrompt: false,
      hasStatusHints: false,
      hasThemeNotice: false,
    });
    const stacked = getChromeHeight({
      layoutMode: 'stacked',
      hasGateFooter: false,
      gateCount: 0,
      hasGatePrompt: false,
      hasStatusHints: false,
      hasThemeNotice: false,
    });
    expect(stacked - full).toBe(1);
  });

  it('adds status hints and theme notice when present', () => {
    const base = getChromeHeight({
      layoutMode: 'compact',
      hasGateFooter: false,
      gateCount: 0,
      hasGatePrompt: false,
      hasStatusHints: false,
      hasThemeNotice: false,
    });
    const withHints = getChromeHeight({
      layoutMode: 'compact',
      hasGateFooter: false,
      gateCount: 0,
      hasGatePrompt: false,
      hasStatusHints: true,
      hasThemeNotice: false,
    });
    const withBoth = getChromeHeight({
      layoutMode: 'compact',
      hasGateFooter: false,
      gateCount: 0,
      hasGatePrompt: false,
      hasStatusHints: true,
      hasThemeNotice: true,
    });
    expect(withHints - base).toBe(1);
    expect(withBoth - withHints).toBe(1);
  });

  it('counts the gate footer height from visible gates and prompt', () => {
    const withoutGate = getChromeHeight({
      layoutMode: 'full',
      hasGateFooter: false,
      gateCount: 0,
      hasGatePrompt: false,
      hasStatusHints: true,
      hasThemeNotice: false,
    });
    const withOneGate = getChromeHeight({
      layoutMode: 'full',
      hasGateFooter: true,
      gateCount: 1,
      hasGatePrompt: false,
      hasStatusHints: true,
      hasThemeNotice: false,
    });
    const withPrompt = getChromeHeight({
      layoutMode: 'full',
      hasGateFooter: true,
      gateCount: 1,
      hasGatePrompt: true,
      hasStatusHints: true,
      hasThemeNotice: false,
    });
    expect(withOneGate - withoutGate).toBe(4 + 1);
    expect(withPrompt - withOneGate).toBe(1);
  });

  it('caps visible gate footer lines at three gates', () => {
    const three = getChromeHeight({
      layoutMode: 'full',
      hasGateFooter: true,
      gateCount: 3,
      hasGatePrompt: false,
      hasStatusHints: false,
      hasThemeNotice: false,
    });
    const ten = getChromeHeight({
      layoutMode: 'full',
      hasGateFooter: true,
      gateCount: 10,
      hasGatePrompt: false,
      hasStatusHints: false,
      hasThemeNotice: false,
    });
    expect(three).toBe(ten);
  });

  it('reserves MainPanel chrome when computing available content height', () => {
    const terminalHeight = 30;
    const chrome = 9;
    const available = getMainPanelContentHeight(terminalHeight, chrome);
    expect(available).toBe(terminalHeight - chrome - MAIN_PANEL_CHROME_HEIGHT);
  });

  it('never returns less than the minimum content height', () => {
    const available = getMainPanelContentHeight(10, 20);
    expect(available).toBe(8);
  });
});
