export interface PercentageFlag {
  readonly key: string;
  readonly enabled: boolean;
  readonly percentage: number;
  readonly allowUserIds?: ReadonlySet<string>;
}

function stableBucket(value: string): number {
  // 同一 flag + userId 必须稳定落入同一桶，否则刷新页面就会切换版本。
  // 这是教学用的 FNV-1a 风格哈希，不用于密码学或安全决策。
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function isFlagEnabled(flag: PercentageFlag, userId: string): boolean {
  if (!flag.enabled) return false; // kill switch 优先于所有规则
  if (flag.allowUserIds?.has(userId)) return true;

  const percentage = Math.min(100, Math.max(0, flag.percentage));
  return stableBucket(`${flag.key}:${userId}`) < percentage;
}
