import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { musiciansApiPlugin } from './vite-plugin-musicians-api';

export default defineConfig({
  plugins: [tailwindcss(), react(), musiciansApiPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
