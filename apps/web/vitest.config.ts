import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['app/**/*.test.ts', 'i18n/**/*.test.ts'],
  },
})
