import globals from 'globals';

// Minimal config focused on catching undefined references (e.g. a value used
// but never imported after the code was split into modules).
export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
