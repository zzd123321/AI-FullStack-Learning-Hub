import type { ChartModel, DataPoint, Domain, PlotRect, ScreenPoint } from './types.js';
import { createLinearScale } from './scales.js';

function extent(values: readonly number[], fallback: Domain): Domain {
  if (values.length === 0) return fallback;
  let min = values[0]!;
  let max = values[0]!;
  for (let index = 1; index < values.length; index += 1) {
    min = Math.min(min, values[index]!);
    max = Math.max(max, values[index]!);
  }
  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.05, 1);
    return { min: min - padding, max: max + padding };
  }
  return { min, max };
}

export function createChartModel(input: readonly DataPoint[]): ChartModel {
  for (const point of input) {
    if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.value)) {
      throw new TypeError('Chart data must contain finite timestamp and value fields');
    }
  }

  const points = [...input].sort((left, right) => left.timestamp - right.timestamp);
  return Object.freeze({
    points: Object.freeze(points),
    xDomain: extent(points.map((point) => point.timestamp), { min: 0, max: 1 }),
    yDomain: extent(points.map((point) => point.value), { min: 0, max: 1 }),
  });
}

export function projectPoints(model: ChartModel, plot: PlotRect): readonly ScreenPoint[] {
  const xScale = createLinearScale(model.xDomain, {
    min: plot.x,
    max: plot.x + plot.width,
  });
  const yScale = createLinearScale(model.yDomain, {
    min: plot.y + plot.height,
    max: plot.y,
  });

  return model.points.map((point, sourceIndex) => ({
    ...point,
    x: xScale(point.timestamp),
    y: yScale(point.value),
    sourceIndex,
  }));
}
