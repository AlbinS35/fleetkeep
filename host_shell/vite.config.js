import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'host_shell',
      remotes: {
        remote_garage: 'http://localhost:5174/assets/remoteEntry.js',
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^19.0.0',
          eager: true,
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^19.0.0',
          eager: true,
        },
        'react-redux': {
          singleton: true,
          requiredVersion: '^9.0.0',
          eager: true,
        },
        '@reduxjs/toolkit': {
          singleton: true,
          requiredVersion: '^2.0.0',
          eager: true,
        },
      },
    }),
  ],
  build: {
    target: 'esnext',
    minify: true,
    cssCodeSplit: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err) => console.error('[HOST→FLASK PROXY ERROR]', err));
          proxy.on('proxyReq', (_, req) => {
            console.log(`[PROXY] ${req.method} ${req.url} → Flask:5000`);
          });
        },
      },
    },
  },
});
