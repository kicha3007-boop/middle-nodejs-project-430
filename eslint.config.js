import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', 'public/', 'tmp/', 'contract/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      eqeqeq: 'error',
      'no-console': ['error', { allow: ['log', 'error'] }],
      'prefer-const': 'error',
    },
  },
);
