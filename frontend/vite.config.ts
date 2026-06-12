import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The frontend consumes the shared package straight from TS source,
      // so Vite compiles it inline and there is no CJS/ESM mismatch.
      '@fightcam/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      // pose-detection statically imports these optional backends, but we only
      // ever run MoveNet on WebGL — alias them to an empty stub so esbuild/rollup
      // don't fail trying to resolve packages we deliberately don't install.
      '@mediapipe/pose': path.resolve(__dirname, 'src/vision/empty-module.ts'),
      '@tensorflow/tfjs-backend-webgpu': path.resolve(
        __dirname,
        'src/vision/empty-module.ts'
      ),
    },
  },
  server: {
    port: 5173,
    fs: {
      // Allow serving the ../shared source folder during dev.
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 2200, // phaser + tfjs are intentionally chunky
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          tfjs: [
            '@tensorflow/tfjs-core',
            '@tensorflow/tfjs-converter',
            '@tensorflow/tfjs-backend-webgl',
            '@tensorflow-models/pose-detection',
          ],
        },
      },
    },
  },
});
