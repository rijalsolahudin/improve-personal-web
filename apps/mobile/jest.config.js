/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/{app,src}/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Suite kontrak core ditulis untuk vitest; API yang dipakainya sama dengan global Jest.
    '^vitest$': '<rootDir>/jest/vitestShim.ts',
  },
  collectCoverageFrom: ['src/{hooks,utils,platform,theme}/**/*.{ts,tsx}', '!**/*.test.{ts,tsx}'],
  coverageThreshold: {
    global: { lines: 80 },
  },
}
