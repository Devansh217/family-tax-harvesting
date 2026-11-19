/**
 * Bundles the engine (src/engine/index.ts) into one ES module, dist-engine/engine.js, with no imports, so server
 * functions (Deno) and plain Node can run it. The bundle is also copied to supabase/functions/_shared/engine.js for the alerts function. Usage: npm run build:engine
 */
import { copyFileSync } from 'node:fs';
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

// The alerts function imports the bundle from its own folder; the copy is generated and git-ignored.
copyFileSync(join(root, 'dist-engine/engine.js'), join(root, 'supabase/functions/_shared/engine.js'));
