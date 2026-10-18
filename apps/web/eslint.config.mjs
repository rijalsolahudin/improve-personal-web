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
  {
    // ARCHITECTURE.md §3: server tetap DILARANG punya kemampuan dekripsi. Record disimpan sebagai
    // ciphertext dan kuncinya cuma ada di perangkat, jadi mengimpor paket ini di `server/**` akan
    // menghapus jaminan itu - biasanya tanpa disadari (mis. demi memakai satu tipe).
    files: ['server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@improve-personal/core', '@improve-personal/core/*'],
              message: 'server tidak boleh memakai packages/core (ARCHITECTURE.md §3).',
            },
            {
              group: ['@improve-personal/crypto', '@improve-personal/crypto/*'],
              message: 'server tidak boleh mendekripsi data user (ARCHITECTURE.md §3).',
            },
          ],
        },
      ],
    },
  },
  prettierCompat,
)
