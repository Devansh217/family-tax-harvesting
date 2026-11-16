import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { SUPABASE_URL } from './src/cloud-config';
import { cspFor } from './src/csp';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'content-security-policy',
      apply: 'build',
      transformIndexHtml: (html: string) => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${cspFor(SUPABASE_URL)}">`),
    },
  ],
  // Fonts are always shipped as files: an inlined data: font would break the page's font-src 'self' policy.
  build: { assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined) },
  server: { port: 5199, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'] },
} as never);
