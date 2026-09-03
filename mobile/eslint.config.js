// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')
const prettier = require('eslint-config-prettier')

module.exports = defineConfig([
  expoConfig,
  prettier,
  {
    ignores: ['dist/*', 'ios/*', 'android/*', '.expo/*', 'expo-env.d.ts'],
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { Buffer: 'readonly', process: 'readonly', console: 'readonly' } },
  },
  {
    files: ['jest.setup.js', '**/*.test.{ts,tsx,js}'],
    languageOptions: {
      globals: { jest: 'readonly', describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly', beforeEach: 'readonly', afterEach: 'readonly' },
    },
  },
  {
    // eslint-plugin-react's version detection crashes under ESLint 10.
    settings: { react: { version: '19.1.0' } },
    rules: {
      // Shared values are read with .get()/.set(); the compiler can see through those.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
])
