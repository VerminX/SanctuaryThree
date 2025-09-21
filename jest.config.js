/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  clearMocks: true,
  collectCoverageFrom: [
    'server/**/*.ts',
    '!server/**/__tests__/**',
    '!server/**/*.test.ts',
  ],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1'
  }
};