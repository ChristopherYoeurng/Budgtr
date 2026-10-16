module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      '@react-native' +
      '|react-native' +
      '|@react-navigation' +
      '|react-native-gifted-charts' +
      '|react-native-linear-gradient' +
      '|react-native-screens' +
      '|react-native-safe-area-context' +
      '|@shopify/flash-list' +
      '|@op-engineering/op-sqlite' +
      '|react-native-plaid-link-sdk' +
      ')/)',
  ],
  moduleNameMapper: {
    '^@op-engineering/op-sqlite$': '<rootDir>/__mocks__/op-sqlite.ts',
    '^react-native-plaid-link-sdk$':
      '<rootDir>/__mocks__/react-native-plaid-link-sdk.ts',
    '^.*/plaid\\.config$': '<rootDir>/__mocks__/plaid.config.ts',
  },
};
