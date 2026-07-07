import type { Command } from 'commander';

export function registerUi(program: Command): void {
  program
    .command('ui')
    .description('Interactive TUI (ink)')
    .action(async () => {
      const { render } = await import('ink');
      const { App } = await import('../ui/App.js');
      const React = (await import('react')).default;
      render(React.createElement(App));
    });
}
