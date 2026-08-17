import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SpareLink',
        short_name: 'SpareLink',
        description: 'Offline-first spare-parts marketplace',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8081' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
