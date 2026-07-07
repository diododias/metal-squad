import type { Command } from 'commander';

export function registerUi(program: Command): void {
  program
    .command('ui')
    .description('Interactive TUI (ink)')
    .action(async () => {
      const { render } = await import('ink');
      const { App } = await import('../ui/App.js');
      const React = (await import('react')).default;
      const { startTelegramPoller, stopTelegramPoller } = await import('../core/notify/telegram-poller.js');
      startTelegramPoller();
      const instance = render(React.createElement(App));
      await instance.waitUntilExit();
      stopTelegramPoller();
    });
}
