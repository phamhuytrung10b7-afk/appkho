import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'root-favicon-support',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/favicon.ico' || req.url === '/favicon.svg') {
              const filePath = path.resolve(__dirname, req.url.slice(1));
              if (fs.existsSync(filePath)) {
                res.setHeader('Content-Type', req.url.endsWith('.ico') ? 'image/x-icon' : 'image/svg+xml');
                return fs.createReadStream(filePath).pipe(res);
              }
            }
            next();
          });
        },
        closeBundle() {
          const distDir = path.resolve(__dirname, 'dist');
          if (fs.existsSync(distDir)) {
            ['favicon.ico', 'favicon.svg'].forEach((file) => {
              const src = path.resolve(__dirname, file);
              const dest = path.resolve(distDir, file);
              if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
              }
            });
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
