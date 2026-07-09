import type { Command } from 'commander';
import { startWebServer } from '../web/server.js';
import { getOrCreateWebToken, resolveWebConfig } from '../web/token.js';

export function registerWeb(program: Command): void {
  program
    .command('web')
    .description('Start the msq web server in the foreground')
    .option('--host <host>', 'bind address')
    .option('--port <port>', 'port number')
    .option('--no-auth', 'disable token authentication')
    .action(async (opts: { host?: string; port?: string; auth?: boolean }) => {
      const config = resolveWebConfig({
        host: opts.host,
        port: opts.port !== undefined ? Number(opts.port) : undefined,
        auth: opts.auth === false ? 'none' : 'token',
      });

      const token = config.auth === 'token' ? await getOrCreateWebToken() : '';
      const server = await startWebServer({ ...config, token });

      const displayUrl = config.auth === 'token' ? `${server.url}?token=${token}` : server.url;
      console.log(`msq web running at ${displayUrl}`);

      process.on('SIGINT', () => {
        server.close().then(() => process.exit(0)).catch(() => process.exit(1));
      });
      process.on('SIGTERM', () => {
        server.close().then(() => process.exit(0)).catch(() => process.exit(1));
      });
    });
}
