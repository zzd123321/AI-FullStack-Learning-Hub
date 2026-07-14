import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'jsdom',
    setupFiles: ['./setup-tests.mts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['**/enrollment-policy.ts', '**/EnrollmentPanel.tsx'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
})
