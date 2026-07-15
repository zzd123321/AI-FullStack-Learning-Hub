import type { DataPoint } from './types.js';

export function createDataTable(data: readonly DataPoint[], captionText: string): HTMLTableElement {
  const table = document.createElement('table');
  const caption = table.createCaption();
  caption.textContent = captionText;
  const head = table.createTHead().insertRow();
  for (const label of ['时间', '数值']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    head.append(cell);
  }
  const body = table.createTBody();
  for (const point of data) {
    const row = body.insertRow();
    row.insertCell().textContent = new Date(point.timestamp).toLocaleString();
    row.insertCell().textContent = String(point.value);
  }
  return table;
}
