module.exports = {
  testEnvironment: 'node',
  preset: null,
  transform: {
    '^.+\\.js$': ['babel-jest', {
      presets: [['@babel/preset-env', {
        targets: { node: 'current' },
        modules: false
      }]]
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(supertest)/)'
  ],
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/database/**/*.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};