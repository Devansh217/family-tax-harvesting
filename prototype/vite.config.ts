import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5199, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'] },
} as never);
