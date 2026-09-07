import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'favicon.svg',
        'logomark.png',
        'elearningville-logo.png',
        'apple-touch-icon.png',
        'pwa-192.png',
        'pwa-512.png',
      ],
      manifest: {
        id: '/',
        name: 'E-Learning Ville OPCR',
        short_name: 'OPCR',
        description:
          'Office Performance Commitment and Review for LGU Mauban E-Learning Ville.',
        theme_color: '#0f766e',
        background_color: '#042f2e',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['productivity', 'business'],
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'opcr-pages',
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /[\\/]node_modules[\\/](?:react|react-dom|react-router(?:-dom)?|scheduler)[\\/]/,
            },
            {
              name: 'supabase',
              test: /[\\/]node_modules[\\/]@supabase[\\/]/,
            },
            {
              name: 'icons',
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
            },
          ],
        },
      },
    },
  },
})
