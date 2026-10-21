import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: './', // CRITICAL: Enables relative path resolution when loaded by Electron via loadFile()
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    watch: {
      ignored: [
        '**/*.exe',
        '**/*.dll',
        '**/release/**',
        '**/dist/**',
        '**/build/**',
        '**/*.tmp',
        '**/probaho_erp.db*'
      ],
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
});
