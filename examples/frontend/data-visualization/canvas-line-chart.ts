import { createChartModel, projectPoints } from './chart-model.js';
import { findNearestByX } from './hit-test.js';
import type { DataPoint, ScreenPoint } from './types.js';

export interface CanvasChartHandle {
  update(points: readonly DataPoint[]): void;
  destroy(): void;
}

export function mountCanvasLineChart(
  canvas: HTMLCanvasElement,
  announce: (text: string) => void,
): CanvasChartHandle {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  let data: readonly DataPoint[] = [];
  let projected: readonly ScreenPoint[] = [];
  let frameId: number | null = null;

  const draw = () => {
    frameId = null;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    projected = projectPoints(createChartModel(data), {
      x: 48,
      y: 16,
      width: Math.max(1, rect.width - 64),
      height: Math.max(1, rect.height - 48),
    });
    context.beginPath();
    projected.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.strokeStyle = '#2563eb';
    context.lineWidth = 2;
    context.stroke();
  };

  const scheduleDraw = () => {
    if (frameId !== null) return;
    frameId = requestAnimationFrame(draw);
  };
  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const nearest = findNearestByX(projected, event.clientX - rect.left);
    if (nearest) announce(`时间 ${nearest.timestamp}，数值 ${nearest.value}`);
  };
  const resizeObserver = new ResizeObserver(scheduleDraw);
  resizeObserver.observe(canvas);
  canvas.addEventListener('pointermove', onPointerMove);

  return {
    update(points) {
      data = points;
      scheduleDraw();
    },
    destroy() {
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      if (frameId !== null) cancelAnimationFrame(frameId);
    },
  };
}
