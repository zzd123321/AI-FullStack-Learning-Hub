import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import pluginVue from 'eslint-plugin-vue';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // 生成物和第三方文件没有人工维护价值，统一从所有配置中排除。
  globalIgnores([
    'dist/',
    'coverage/',
    'node_modules/',
    'public/vendor/',
    '**/*.generated.*',
  ]),
  {
    name: 'learning/browser-and-vue-source',
    files: ['src/**/*.{js,mjs,cjs,ts,mts,cts,tsx,vue}'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...pluginVue.configs['flat/recommended'],
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        // 使用与编辑器一致的 TS Project Service，让规则拿到真实类型信息。
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'warn',
    },
    rules: {
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // 普通 JS 仍执行基础 lint，只关闭那些必须依赖 TypeScript 类型图的规则。
    name: 'learning/plain-javascript-without-type-information',
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Node 工具和浏览器源码拥有不同的全局变量，不能混成一个环境。
    name: 'learning/node-tooling-javascript',
    files: ['*.config.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    name: 'learning/node-tooling-typescript',
    files: ['*.config.{ts,mts,cts}', 'scripts/**/*.{ts,mts,cts}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // 必须放在最后，关闭与 Prettier 冲突的格式类规则。
  eslintConfigPrettier,
]);
