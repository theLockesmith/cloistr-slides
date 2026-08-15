/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: true,
    // The suite covers the document model and canvas geometry, both of which
    // are pure. No DOM, so no jsdom and no native build deps in CI.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    pool: 'forks', // more reliable than threads on Alpine/CI
  },
})
