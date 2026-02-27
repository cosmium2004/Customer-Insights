module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'migrations/**/*.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  testTimeout: 30000, // 30 seconds for database operations
  verbose: true
};
