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
  let lastAnnouncedSourceIndex: number | null = null;
  let destroyed = false;

  const draw = () => {
    frameId = null;
    const rect = canvas.getBoundingClientRect();
    // DPR 不设上限时，大型 4K 画布的内存和填充成本会按面积增长。
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const bufferWidth = Math.round(rect.width * ratio);
    const bufferHeight = Math.round(rect.height * ratio);
    // 改 width/height 会清空位图与上下文状态，所以只在真实尺寸变化时重设。
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    }
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
    if (destroyed || frameId !== null) return;
    frameId = requestAnimationFrame(draw);
  };
  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const nearest = findNearestByX(projected, event.clientX - rect.left);
    if (nearest && nearest.sourceIndex !== lastAnnouncedSourceIndex) {
      lastAnnouncedSourceIndex = nearest.sourceIndex;
      // 实际产品应在这里使用显式 locale/timeZone/unit 的格式化器。
      announce(`时间 ${nearest.timestamp}，数值 ${nearest.value}`);
    }
    if (!nearest) lastAnnouncedSourceIndex = null;
  };
  const resizeObserver = new ResizeObserver(scheduleDraw);
  resizeObserver.observe(canvas);
  canvas.addEventListener('pointermove', onPointerMove);

  return {
    update(points) {
      if (destroyed) throw new Error('Canvas chart handle is destroyed');
      data = points;
      scheduleDraw();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      if (frameId !== null) cancelAnimationFrame(frameId);
      // 释放大型 backing store；调用方若复用 canvas，可在下次挂载时重新设置。
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
