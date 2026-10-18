import { packageConfig } from '@improve-personal/config/eslint'

export default [
  ...packageConfig,
  {
    // Test boleh menyentuh Node; kode runtime tetap platform-agnostic (ARCHITECTURE.md §3).
    files: ['**/*.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
]
