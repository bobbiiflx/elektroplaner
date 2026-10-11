import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' sorgt dafür, dass die App auch unter https://<user>.github.io/<repo>/ läuft.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
  test: { environment: 'node' },
})
