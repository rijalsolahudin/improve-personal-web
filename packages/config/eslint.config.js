import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

/**
 * Aturan yang berlaku di semua workspace (web, mobile, packages).
 * Format diserahkan ke Prettier, jadi aturan stylistic dimatikan lewat eslint-config-prettier.
 */
export const sharedRules = {
  'no-console': ['error', { allow: ['warn', 'error'] }],
  eqeqeq: ['error', 'always'],
}

/** Aturan TypeScript - hanya untuk file yang diparse parser TS (.ts / .vue). */
export const typescriptRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
  '@typescript-eslint/consistent-type-imports': 'error',
}

/**
 * ARCHITECTURE.md §3: packages/* wajib TS murni - tanpa framework UI, Node API, atau DOM.
 */
const PLATFORM_IMPORTS = [
  'vue',
  'nuxt',
  'nuxt/*',
  '#app',
  '#imports',
  'react',
  'react-native',
  'react-native/*',
  'expo',
  'expo-*',
  'fs',
  'node:*',
  'crypto',
  'path',
]

/** Preset untuk packages/* (TS murni, platform-agnostic). */
export const packageConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      ...sharedRules,
      ...typescriptRules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: PLATFORM_IMPORTS,
              message: 'packages/* harus platform-agnostic (ARCHITECTURE.md §3).',
            },
          ],
        },
      ],
    },
  },
  prettier,
)

export { prettier as prettierCompat }
