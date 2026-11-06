import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
    { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.vite/**', '**/.vite-temp/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended.map(config => ({ ...config, files: ['**/*.ts'] })),
    { files: ['apps/game/src/**/*.ts'], languageOptions: { globals: globals.browser } },
    { files: ['**/*.mjs', 'apps/game/log.js'], languageOptions: { globals: globals.node } },
    { files: ['apps/game/log.js'], languageOptions: { sourceType: 'commonjs' } },
);
