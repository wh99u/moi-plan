import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // The cut-out worker loads transformers.js, which splits into chunks.
  worker: { format: 'es' },
  test: { environment: 'jsdom' },
});
