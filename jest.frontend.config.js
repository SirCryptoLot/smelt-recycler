const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'jest-environment-jsdom',
  testMatch: [
    '<rootDir>/app/__tests__/**/*.test.{ts,tsx}',
    '<rootDir>/components/__tests__/**/*.test.{ts,tsx}',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^uuid$': '<rootDir>/node_modules/uuid/dist/index.js',
    '^@/(.*)$': '<rootDir>/$1',
  },
});
