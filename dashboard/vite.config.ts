import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4242,
    proxy: {
      '/api': 'http://localhost:4243',
      '/logs': 'http://localhost:4243',
      '/trigger': 'http://localhost:4243',
      '/webhook': 'http://localhost:4243',
      '/pause': 'http://localhost:4243',
      '/resume': 'http://localhost:4243',
    },
  },
  build: {
    outDir: 'dist',
  },
});
