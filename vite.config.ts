import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: ['es2022','safari15.4'], chunkSizeWarningLimit: 800 },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, watch:{ignored:['**/release/**','**/dist/**']} },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
