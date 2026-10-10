/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: true,
    // The suite covers the document model and canvas geometry, both of which
    // are pure. No DOM, so no jsdom and no native build deps in CI.
    environment: 'node',
    // .tsx: component render tests opt into jsdom per file (@vitest-environment).
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    pool: 'forks', // more reliable than threads on Alpine/CI
  },
})
