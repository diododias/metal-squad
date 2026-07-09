import type { Command } from 'commander';

const ENTER_ALT_SCREEN = '\u001B[?1049h';
const EXIT_ALT_SCREEN = '\u001B[?1049l';

function enterAlternateScreen(): () => void {
  // Only use the alternate screen when stdout is a real terminal. In tests
  // and piped environments the escape sequences would pollute captured output
  // without providing any benefit.
  if (!process.stdout.isTTY) {
    return (): void => {
      // Non-TTY output: alternate screen is not useful and would only pollute logs.
    };
  }

  let restored = false;

  const restore = (): void => {
    if (restored) return;
    restored = true;
    process.stdout.write(EXIT_ALT_SCREEN);
  };

  const handleSignal = (signal: NodeJS.Signals): void => {
    restore();
    process.kill(process.pid, signal);
  };

  process.stdout.write(ENTER_ALT_SCREEN);

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
  process.once('exit', restore);

  return () => {
    restore();
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
    process.off('exit', restore);
  };
}

export function registerUi(program: Command): void {
  program
    .command('ui')
    .description('Interactive TUI (ink)')
    .action(async () => {
      const restoreScreen = enterAlternateScreen();
      try {
        const { render } = await import('ink');
        const { App } = await import('../ui/App.js');
        const React = (await import('react')).default;
        const { startTelegramPoller, stopTelegramPoller } = await import('../core/notify/telegram-poller.js');
        startTelegramPoller();
        const instance = render(React.createElement(App));
        await instance.waitUntilExit();
        stopTelegramPoller();
      } finally {
        restoreScreen();
      }
    });
}
