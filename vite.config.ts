import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Three.js ist allein ~700 kB groß; der 3D-Vendor-Chunk liegt daher bewusst über 500 kB.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-vendor', priority: 1, test: /node_modules[\\/](three|three-stdlib|@react-three|camera-controls|troika)/ },
            { name: 'react-vendor', priority: 2, test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
