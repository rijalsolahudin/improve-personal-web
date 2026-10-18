import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    // `server/**` ikut: test service & handler server memakai env `nuxt` yang sama supaya bisa
    // membangun instance Nitro dan memakai Postgres lokal seperti test app.
    include: ['app/**/*.test.ts', 'i18n/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
