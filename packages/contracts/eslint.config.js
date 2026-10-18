import { packageConfig } from '@improve-personal/config/eslint'

export default [
  ...packageConfig,
  {
    // Test jalan di Node (vitest), bukan bagian dari runtime paket - jadi boleh impor node:*.
    files: ['**/*.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
]
