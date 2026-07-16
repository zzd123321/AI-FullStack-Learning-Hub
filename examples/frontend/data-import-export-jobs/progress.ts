export interface StageProgress {
  readonly completed: number;
  readonly total: number | null;
  readonly weight: number;
}

export function weightedProgress(stages: readonly StageProgress[]): number | null {
  if (stages.length === 0 || stages.some(({ total }) => total === null || total <= 0)) return null;
  const weightSum = stages.reduce((sum, { weight }) => sum + Math.max(0, weight), 0);
  if (weightSum === 0) return null;
  const value = stages.reduce((sum, { completed, total, weight }) => {
    if (total === null || total <= 0) return sum;
    const ratio = Math.min(1, Math.max(0, completed / total));
    return sum + ratio * Math.max(0, weight);
  }, 0) / weightSum;
  return Math.round(value * 100);
}
