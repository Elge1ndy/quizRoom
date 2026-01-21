import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-cloudflare-files',
      closeBundle() {
        // Copy Cloudflare Pages configuration files to dist
        try {
          copyFileSync('_redirects', 'dist/_redirects')
          copyFileSync('_headers', 'dist/_headers')
          console.log('✅ Copied Cloudflare Pages config files')
        } catch (err) {
          console.warn('⚠️ Could not copy Cloudflare config files:', err.message)
        }
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: true
  }
})
