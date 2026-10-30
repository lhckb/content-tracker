/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the build works wherever it's served from:
  // GitHub Pages puts it under /content-tracker/. The app has one page and
  // no client-side routes, so nothing needs an absolute base.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    // npm run dev:phone: lets a phone on the same Wi-Fi open the dev server
    // by the Mac's network name (e.g. http://luiss-macbook-air.local:5173),
    // which, unlike its IP, stays the same, so it can be listed once in the
    // dev Supabase project's Redirect URLs. Vite refuses unknown names
    // otherwise.
    allowedHosts: ['.local'],
  },
  test: {
    setupFiles: ['src/test/setup.ts'],
    env: {
      // West of UTC, where parsing 'YYYY-MM-DD' as UTC midnight lands on the
      // previous day, so that mistake fails the tests.
      TZ: 'America/Los_Angeles',
      // A build without Supabase or reminders, as in CI, whatever .env.local
      // holds on this machine.
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_VAPID_PUBLIC_KEY: '',
    },
  },
})
