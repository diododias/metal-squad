import { build } from 'esbuild';

await build({
  entryPoints: ['src/web/client/index.tsx'],
  bundle: true,
  outfile: 'dist/web/static/app.js',
  format: 'esm',
  target: 'es2022',
  jsx: 'transform',
  minify: true,
  sourcemap: true,
  logLevel: 'info',
});
