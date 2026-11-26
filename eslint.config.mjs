import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default defineConfig(
  { ignores: ['dist/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, typescript.configs['flat/recommended']],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
