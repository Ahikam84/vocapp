import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'VocApp – לימוד אוצר מילים',
        short_name: 'VocApp',
        lang: 'he',
        dir: 'rtl',
        start_url: '.',
        display: 'standalone',
        background_color: '#f6f7fb',
        theme_color: '#2f6b4f',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
})
