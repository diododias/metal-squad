import type { Command } from 'commander';
import { startWebServer } from '../web/server.js';
import { resolveWebConfig, resolveWebPassword } from '../web/token.js';

export function registerWeb(program: Command): void {
  program
    .command('web')
    .description('Start the msq web server in the foreground')
    .option('--host <host>', 'bind address')
    .option('--port <port>', 'port number')
    .option('--no-auth', 'disable password authentication')
    .option('--rotate-token', 'generate a fresh auto-generated password before starting, invalidating the previous one (ignored when MSQ_WEB_PASSWORD is set)')
    .action(async (opts: { host?: string; port?: string; auth?: boolean; rotateToken?: boolean }) => {
      const config = resolveWebConfig({
        host: opts.host,
        port: opts.port !== undefined ? Number(opts.port) : undefined,
        auth: opts.auth === false ? 'none' : 'token',
      });

      let token = '';
      if (config.auth === 'token') {
        const { password, source } = await resolveWebPassword({ rotate: opts.rotateToken === true });
        token = password;
        if (opts.rotateToken === true && source === 'env') {
          console.log('MSQ_WEB_PASSWORD is set — --rotate-token ignored, unset it or change its value to rotate');
        } else if (opts.rotateToken === true) {
          console.log('web password rotated — the previous password and any existing sessions are no longer valid');
        }
      }
      const server = await startWebServer({ ...config, token });

      console.log(`msq web running at ${server.url}`);
      if (config.auth === 'token') {
        console.log('log in at /auth with your password (set MSQ_WEB_PASSWORD to define your own)');
      }

      process.on('SIGINT', () => {
        server.close().then(() => process.exit(0)).catch(() => process.exit(1));
      });
      process.on('SIGTERM', () => {
        server.close().then(() => process.exit(0)).catch(() => process.exit(1));
      });
    });
}
