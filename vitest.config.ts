import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: { alias: { '@engine': r('./engine') } },
  test: {
    environment: 'node',
    include: ['engine/test/**/*.test.ts', 'server/test/**/*.test.ts', 'web/test/**/*.test.ts', 'scripts/test/**/*.test.ts', 'kit/test/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    testTimeout: 20_000,
  },
})
