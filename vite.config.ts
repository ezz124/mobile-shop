import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        // تجاهل أخطاء الاتصال المؤقتة أثناء بدء تشغيل الـ API server
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
              if ('writeHead' in res && typeof res.writeHead === 'function') {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'الخادم يبدأ التشغيل — أعد المحاولة بعد لحظة' }));
              }
            }
          });
        },
      },
    },
  },
});
