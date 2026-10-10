import { prettierCompat, sharedRules, typescriptRules } from '@improve-personal/config/eslint'

import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      ...sharedRules,
      // security.md §5: teks user tidak pernah dirender sebagai HTML.
      'vue/no-v-html': 'error',
      'vue/require-explicit-emits': 'error',
      'vue/no-unused-refs': 'error',
    },
  },
  {
    files: ['**/*.ts', '**/*.vue'],
    rules: typescriptRules,
  },
  prettierCompat,
)
