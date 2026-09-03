// Unit tests with jest-expo. The workspace uses pnpm's isolated layout, so
// every dependency really lives at ../node_modules/.pnpm/<name>@<version>/
// node_modules/<name>/... The ignore pattern therefore skips the `.pnpm`
// segment and decides on the package name that follows it: React Native,
// Expo and the few libraries that ship untranspiled ESM are transformed
// (matched by prefix, so `expo` covers `expo-notifications`), everything
// else is left alone.
const transformed = [
  '(jest-)?react-native',
  '@react-native',
  'expo',
  '@expo',
  '@expo-google-fonts',
  'react-navigation',
  '@react-navigation',
  '@sentry/react-native',
  'native-base',
  '@shopify/flash-list',
  '@zauq/shared',
].join('|')

module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    `node_modules/(?!\\.pnpm)(?!(${transformed}))`,
    'node_modules/react-native-reanimated/plugin/',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/', '/.maestro/'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
}
