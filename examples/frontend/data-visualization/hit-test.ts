import type { ScreenPoint } from './types.js';

export function findNearestByX(
  sortedPoints: readonly ScreenPoint[],
  pointerX: number,
  maxDistance = 24,
): ScreenPoint | undefined {
  if (sortedPoints.length === 0) return undefined;

  let low = 0;
  let high = sortedPoints.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sortedPoints[middle]!.x < pointerX) low = middle + 1;
    else high = middle;
  }

  const candidates = [sortedPoints[low - 1], sortedPoints[low]].filter(
    (point): point is ScreenPoint => point !== undefined,
  );
  const nearest = candidates.reduce((best, point) =>
    Math.abs(point.x - pointerX) < Math.abs(best.x - pointerX) ? point : best,
  );
  return Math.abs(nearest.x - pointerX) <= maxDistance ? nearest : undefined;
}
