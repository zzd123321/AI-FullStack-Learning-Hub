/** @type {import('lint-staged').Configuration} */
export default {
  // 同一个文件先做可安全自动修复的 lint，再交给 Prettier 统一排版。
  '*.{js,mjs,cjs,ts,mts,cts,tsx,vue}': [
    'eslint --fix --max-warnings=0',
    'prettier --write',
  ],
  // 这个 glob 与上面互斥，避免两个并发任务同时写同一文件。
  '*.{json,md,yaml,yml,css,scss,html}': 'prettier --write',
};
