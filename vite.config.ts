import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src/index.ts', 'src/useWavAudioRecorder.ts', 'src/useWavToMp3Worker.ts'],
    }),
    react(),
  ],
  base: './',
  publicDir: false,
  build: {
    emptyOutDir: true,
    lib: {
      entry: {
        index: path.resolve(import.meta.dirname, 'src/index.ts'),
      },
      name: 'react-use-wav-audio-recorder',
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.${format}.js`,
    },
    rolldownOptions: {
      external: ['react', 'react-dom'],
      output: {
        banner: (chunk) => chunk.isEntry ? "'use client';" : '',
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
});
