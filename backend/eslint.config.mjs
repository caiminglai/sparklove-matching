// ============================================================
// 后端 ESLint（flat config）
//
// 与站3 `backend/eslint.config.js` 同一份规则集，两处本站自己的口径差写在旁边：
//   1) 文件名用 .mjs。本站 package.json 没有 "type":"module"，叫 .js 时
//      ESLint 会先警告再按 ESM 重新解析（站2 `app/eslint.config.mjs` 同理）。
//   2) eslint 是 10.x（本站 devDependencies 早就钉在 ^10.5.0），
//      而 10.x 不再把 @eslint/js 与 globals 当自带依赖带进来（eslint 9 会），
//      所以这两个包必须在 devDependencies 里点名，否则 `npm ci` 之后 config 直接 require 不到。
// 被检文件是 CommonJS（本站后端全是 require/module.exports），所以 sourceType 写死 commonjs。
// ============================================================
import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  // uploads/ 是运行时写进去的图片，admin/ 只有 html（10-30 现量：admin 下 0 个 .js、uploads 下 0 个文件）；
  // 这两条留在这里是为了将来目录里有东西时也不会被顺手扫进门禁。
  globalIgnores(['node_modules', 'uploads', 'admin', 'data']),

  // 与 Prettier 冲突的格式规则一律关掉：格式由 `npm run format:check` 单独判，
  // 两边都报会出现「同一行两个门禁两种说法」。口径同站2 前端 app/eslint.config.mjs。
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      // 未使用变量按警告，且 _ 开头的形参不算未用——中间件签名里
      // errorHandler(err, req, res, next) 的 next 就是这种"必须留着但不用"的参数
      'no-unused-vars': [
        'warn',
        { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 后端日志本来就靠 console：启动横幅（server.js）和请求日志（request-logger.js）
      // 是这两条的正当用法，各开一个口子；业务代码里的 console.log 仍然会被看见
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-var': 'error',
      'prefer-const': 'warn',
      // 空的 catch 块在本站是有意为之（"读不到就用默认值"那一类），放行
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['server.js', 'middleware/request-logger.js'],
    rules: { 'no-console': 'off' },
  },
  {
    // 测试里 console.log 是"给人看差集"的正道，不该被消音
    files: ['test/**/*.js'],
    rules: { 'no-console': 'off' },
  },
]);
