/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server', '<rootDir>/shared'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  clearMocks: true,
  collectCoverageFrom: [
    'server/**/*.ts',
    'shared/**/*.ts',
    '!server/**/__tests__/**',
    '!server/**/*.test.ts',
    '!shared/**/__tests__/**',
    '!shared/**/*.test.ts',
  ],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1'
  }
};