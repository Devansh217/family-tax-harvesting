/**
 * Bundles the engine (src/engine/index.ts) into one ES module, dist-engine/engine.js, with no imports, so server
 * functions (Deno) and plain Node can run it. Usage: npm run build:engine
 */
import { join } from 'node:path';
import { build } from 'vite';

const root = join(__dirname, '..');

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  publicDir: false,
  build: {
    outDir: join(root, 'dist-engine'),
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    lib: { entry: join(root, 'src/engine/index.ts'), formats: ['es'], fileName: () => 'engine.js' },
  },
});
