import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ["node_modules/", ".next/", "out/", "dist/"],
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      'react-hooks': {
        rules: {
          'exhaustive-deps': { create() { return {}; } },
        },
      },
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
