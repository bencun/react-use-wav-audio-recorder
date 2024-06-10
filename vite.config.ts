import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      copyDtsFiles: true,
      rollupTypes: true,
    }),
    react(),
  ],
  base: './',
  publicDir: false,
  build: {
    emptyOutDir: true,
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
      },
      name: 'react-use-wav-audio-recorder',
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.${format}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
});
