/** @type {import('lint-staged').Configuration} */
export default {
  '*.{js,mjs,cjs,ts,mts,cts,tsx,vue}': [
    'eslint --fix --max-warnings=0',
    'prettier --write',
  ],
  '*.{json,md,yaml,yml,css,scss,html}': 'prettier --write',
};
