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
  test: {
    setupFiles: ['src/test/setup.ts'],
    // West of UTC, where parsing 'YYYY-MM-DD' as UTC midnight lands on the
    // previous day, so that mistake fails the tests.
    env: { TZ: 'America/Los_Angeles' },
  },
})
