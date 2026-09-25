import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettierConfig from 'eslint-config-prettier'

// 与站1、站3 的 app/eslint.config.js 同一份结构（09-25 从 .eslintrc.json 升上来）。
// 文件名用 .mjs：本站 package.json 没有 "type": "module"，叫 .js 会让 ESLint 每次
// 先警告再重新按 ESM 解析。
// 唯一一处口径差：旧配置里的 "prettier/prettier": "error" 不再挂 —— 格式由
// `npm run format:check` 管，让 eslint 重复报错会出现两套门禁。
export default defineConfig([
  // public/ 是三方 vendor（three.js 构建产物），里面有指向未安装规则的行内 eslint-disable，会被报 error
  globalIgnores(['dist', 'public']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      {
        plugins: { 'react-refresh': reactRefresh },
        rules: { 'react-refresh/only-export-components': 'warn' },
      },
      prettierConfig,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // eslint-plugin-react-hooks 7.x 新加的编译器规则，存量代码一次改不完，
      // 先降为 warn 让门禁能跑；这三条清零后可以删掉。
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
])
