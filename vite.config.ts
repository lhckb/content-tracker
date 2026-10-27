/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    setupFiles: ['src/test/setup.ts'],
    // West of UTC, where parsing 'YYYY-MM-DD' as UTC midnight lands on the
    // previous day, so that mistake fails the tests.
    env: { TZ: 'America/Los_Angeles' },
  },
})
