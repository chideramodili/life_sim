// Vite builds the game (index.html) and, beside it, the isolated avatar test page (avatar-test.html).
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), avatar: resolve(__dirname, 'avatar-test.html') },
    },
  },
});
