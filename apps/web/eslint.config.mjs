import { prettierCompat, sharedRules, typescriptRules } from '@improve-personal/config/eslint'

import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Folder referensi desain (HTML/JS hasil ekspor) tidak ikut bundle dan bukan kode kita.
  { ignores: ['source-ui/**'] },
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
