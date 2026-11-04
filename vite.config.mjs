import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const backend = `http://127.0.0.1:${process.env.GLADE_BACKEND_PORT ?? '49193'}`;
const proxy = () => ({
  target: backend,
  changeOrigin: true,
  configure(proxy) {
    proxy.on('proxyReq', request => {
      // Keep the Rust same-origin guard intact behind the local dev proxy.
      if (request.getHeader('origin')) request.setHeader('origin', backend);
    });
  },
});
export default defineConfig({
  root: 'web',
  plugins: [tailwindcss()],
  esbuild: { jsx: 'automatic' },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    // Exact endpoint matching keeps /media-info.mjs and other source modules in Vite.
    proxy: { '^/api/': proxy(), '^/media(?:\\?|$)': proxy(), '^/thumbnail(?:\\?|$)': proxy() },
  },
  build: { outDir: '../dist', emptyOutDir: true, target: 'esnext' },
});
