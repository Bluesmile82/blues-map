import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { musiciansApiPlugin } from './vite-plugin-musicians-api';

export default defineConfig({
  plugins: [tailwindcss(), react(), musiciansApiPlugin()],
});
