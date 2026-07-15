declare const process: {
  readonly env: Readonly<Record<string, string | undefined>>;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required build environment: ${name}`);
  return value;
}

export const productionBuildPolicy = {
  define: {
    __RELEASE__: JSON.stringify({
      service: 'learning-web',
      environment: 'production',
      release: requiredEnvironment('RELEASE_ID'),
      buildTime: new Date().toISOString(),
      commit: requiredEnvironment('GIT_SHA'),
    }),
  },
  build: {
    // 生成 map 但不在产物中写 sourceMappingURL；上传成功后不对公网发布 .map。
    sourcemap: 'hidden',
  },
} as const;
