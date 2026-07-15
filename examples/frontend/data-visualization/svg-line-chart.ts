import { createChartModel, projectPoints } from './chart-model.js';
import type { DataPoint } from './types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createAccessibleLineChart(
  data: readonly DataPoint[],
  titleText: string,
  descriptionText: string,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const title = document.createElementNS(SVG_NS, 'title');
  const description = document.createElementNS(SVG_NS, 'desc');
  const path = document.createElementNS(SVG_NS, 'path');
  const titleId = `chart-title-${crypto.randomUUID()}`;
  const descriptionId = `chart-description-${crypto.randomUUID()}`;

  title.id = titleId;
  title.textContent = titleText;
  description.id = descriptionId;
  description.textContent = descriptionText;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-labelledby', `${titleId} ${descriptionId}`);
  svg.setAttribute('viewBox', '0 0 640 320');

  const points = projectPoints(createChartModel(data), {
    x: 56,
    y: 24,
    width: 560,
    height: 248,
  });
  path.setAttribute(
    'd',
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
  );
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  svg.append(title, description, path);
  return svg;
}
