import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend is a single-page app built from index.html + src/.
// The api/ directory is deployed separately by Vercel as serverless functions.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
});
