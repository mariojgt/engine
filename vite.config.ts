import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['recast-navigation'],
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        gameplay: resolve(__dirname, 'gameplay.html'),
      },
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
});
