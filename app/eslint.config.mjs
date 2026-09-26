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
      // eslint-plugin-react-hooks 7.x 新增的三条编译器规则。定案（09-26 深夜）：三站都没启用 React
      // Compiler（react-compiler 在 vite.config.ts 与 package.json 里 0 命中），这三条只是编译器的
      // 配套告警、不改变任何产物，所以 warn 是长期设置而非过渡；哪天真要启用编译器，这三行必须升回
      // error 并逐组件清零，理由与判据见 compose/CONVENTIONS.md §10。
      // 实测计数（react-hooks 7.1.1，0 error / 40 warning）：immutability 0
      // （原 4 条＝DepositPage×2/MyPostsPage/ProfilePage，都不是真违反不可变，只是
      // const 箭头函数声明在它调用的 effect 之后，已把声明整体上移清零）、
      // preserve-manual-memoization 0（原 13 条全在 Home.tsx：useCallback 依赖写了 []，
      // 编译器推断出的依赖是 setXxx 这类 state setter，补进依赖数组即可——useState 的
      // setter 本身引用恒定，所以这笔改动零行为变化，exhaustive-deps 也不会反过来报
      // "多余的依赖"，已在 53b325d 清零）、
      // set-state-in-effect 10（原 7 条＝ReportModal/ShareButton/Home×3/PostPage/
      // useFormDraft，加 3 条＝上移后编译器才看得见的 DepositPage/MyPostsPage/
      // ProfilePage，那三个组件此前整体 Compilation Skipped）。
      // 版本低于 7.1.1 时这三条规则还没实现，量出来是假绿。
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
])
