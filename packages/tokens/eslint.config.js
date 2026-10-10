import { packageConfig } from '@improve-personal/config/eslint'

export default [
  { ignores: ['dist/**'] },
  ...packageConfig,
  {
    // Build script & test jalan di Node, bukan bagian dari paket runtime.
    files: ['scripts/**', '**/*.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
]
