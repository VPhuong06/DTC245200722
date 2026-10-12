import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Không nhúng tài nguyên dạng data: URI để CSP "default-src 'self'" của Nginx không chặn font/ảnh.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: {
    port: 5173,
    // Khi phát triển, chuyển /api sang backend chạy cục bộ.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
