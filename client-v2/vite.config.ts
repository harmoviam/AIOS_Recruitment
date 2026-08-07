import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const apiPort = env.PORT || '3010';

  return {
    plugins: [react()],
    // Load VITE_* from repo root .env (same place as DATABASE_URL / PORT).
    envDir: '..',
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
          // Keep SSE plan streams flushing through the dev proxy.
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes, _req, res) => {
              const ct = proxyRes.headers['content-type'];
              if (typeof ct === 'string' && ct.includes('text/event-stream')) {
                res.setHeader('Cache-Control', 'no-cache, no-transform');
                res.setHeader('X-Accel-Buffering', 'no');
              }
            });
          },
        },
      },
    },
  };
});
