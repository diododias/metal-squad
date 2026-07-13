import type { Command } from 'commander';
import { startWebServer } from '../web/server.js';
import { getOrCreateWebToken, resolveWebConfig, rotateWebToken } from '../web/token.js';

export function registerWeb(program: Command): void {
  program
    .command('web')
    .description('Start the msq web server in the foreground')
    .option('--host <host>', 'bind address')
    .option('--port <port>', 'port number')
    .option('--no-auth', 'disable token authentication')
    .option('--rotate-token', 'generate a fresh web token before starting, invalidating the previous one')
    .action(async (opts: { host?: string; port?: string; auth?: boolean; rotateToken?: boolean }) => {
      const config = resolveWebConfig({
        host: opts.host,
        port: opts.port !== undefined ? Number(opts.port) : undefined,
        auth: opts.auth === false ? 'none' : 'token',
      });

      let token = '';
      if (config.auth === 'token') {
        if (opts.rotateToken === true) {
          token = await rotateWebToken();
          console.log('web token rotated — previous token and login URLs are no longer valid');
        } else {
          token = await getOrCreateWebToken();
        }
      }
      const server = await startWebServer({ ...config, token });

      const displayUrl = config.auth === 'token' ? `${server.url}/auth?ticket=${server.issueLoginTicket()}` : server.url;
      console.log(`msq web running at ${displayUrl}`);
      if (config.auth === 'token') {
        console.log('login link is single-use and expires in 10 minutes; restart msq web for a fresh one');
      }

      process.on('SIGINT', () => {
        server.close().then(() => process.exit(0)).catch(() => process.exit(1));
      });
      process.on('SIGTERM', () => {
        server.close().then(() => process.exit(0)).catch(() => process.exit(1));
      });
    });
}
