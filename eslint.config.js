// The root devDependency on typescript ~6.0.x exists only for this linter:
// typescript-eslint does not support the TS 7 (native) compiler API yet, so it
// parses with the TS 6 JS API while each package keeps TS 7 for tsc.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'data/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      // The codebase intentionally uses `any` at Claude stream / SSE / DB boundaries.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['apps/server/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
