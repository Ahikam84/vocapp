import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/** e.g. "2026-11-08 · a1b2c3d" – shown in Settings so it's easy to tell which version is running. */
function appVersion() {
  const date = new Date().toISOString().slice(0, 10)
  try {
    return `${date} · ${execSync('git rev-parse --short HEAD').toString().trim()}`
  } catch {
    return date
  }
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  // Supabase's default Site URL is http://localhost:3000, so email sign-in links land here.
  server: { port: 3000, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      // The new version waits until the user taps "refresh" in the update banner,
      // so a lesson in progress is never reloaded from under them.
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      // Precache the font and the mascot images too, so the app looks the same offline.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,webp}'],
        // Recorded pronunciations: too many to precache, so each is kept once it has been played.
        runtimeCaching: [
          {
            urlPattern: /\/audio\/.+\.mp3$/,
            handler: 'CacheFirst',
            options: { cacheName: 'audio', expiration: { maxEntries: 4000 }, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: /\/audio\/.+\/index\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'audio-index', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
      manifest: {
        name: 'VocApp – לימוד אוצר מילים',
        short_name: 'VocApp',
        lang: 'he',
        dir: 'rtl',
        start_url: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
})
