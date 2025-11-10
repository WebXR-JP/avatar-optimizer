const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const unusedImports = require('eslint-plugin-unused-imports')
const simpleImportSort = require('eslint-plugin-simple-import-sort')
const importPlugin = require('eslint-plugin-import')

module.exports = tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      'unused-imports': unusedImports,
      'simple-import-sort': simpleImportSort,
      import: importPlugin,
    },
    rules: {
      // インポート関連
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // すべてのimportを単一の配列にまとめて改行を防ぐ
            ['^\\u0000', '^node:', '^@?\\w', '^', '^\\.'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // コードスタイル
      indent: ['error', 2, { SwitchCase: 1 }],
      quotes: ['error', 'single'],
      semi: ['error', 'never'],
      'comma-dangle': ['error', 'always-multiline'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'comma-spacing': ['error', { before: false, after: true }],
      'key-spacing': ['error', { beforeColon: false, afterColon: true }],
      'space-before-blocks': 'error',
      'space-infix-ops': 'error',
      'space-unary-ops': ['error', { words: true, nonwords: false }],
      'no-trailing-spaces': 'error',
      'eol-last': 'error',

      // TypeScript固有
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error', // any型の使用を禁止

      // export/import関連
      'import/no-default-export': 'error', // default exportを禁止
      'import/prefer-default-export': 'off', // default exportを推奨しない

      // 一般的なルール
      'no-console': ['warn', { allow: ['error'] }],
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'arrow-spacing': 'error',
    },
  },
  // 特定ファイルでのみdefault exportを許可
  {
    files: ['tsup.config.ts', '*.config.*', '**/*.d.ts'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
)
