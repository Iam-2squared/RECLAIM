import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Keep the approved TITLE/HOME entry at its original URL. The independent
// Shiretoko development review is a separate, opt-in page; no navigation,
// campaign save or mission entry is changed by bundling it.
const entry = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({
  base: './',
  build: {
    target: ['es2022', 'safari15.4'],
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        index: entry('./index.html'),
        'shiretoko-terrain': entry('./shiretoko-terrain.html'),
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
