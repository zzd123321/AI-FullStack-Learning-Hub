import type { DataPoint } from './types.js';

export interface DataTableOptions {
  readonly caption: string;
  readonly timeColumnLabel: string;
  readonly valueColumnLabel: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly numberOptions?: Intl.NumberFormatOptions;
}

export function createDataTable(
  data: readonly DataPoint[],
  options: DataTableOptions,
): HTMLTableElement {
  const dateFormatter = new Intl.DateTimeFormat(options.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: options.timeZone,
  });
  const numberFormatter = new Intl.NumberFormat(options.locale, options.numberOptions);
  const table = document.createElement('table');
  const caption = table.createCaption();
  caption.textContent = options.caption;
  const head = table.createTHead().insertRow();
  for (const label of [options.timeColumnLabel, options.valueColumnLabel]) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    head.append(cell);
  }
  const body = table.createTBody();
  for (const point of data) {
    if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.value)) {
      throw new TypeError('Data table requires finite timestamps and values');
    }
    const row = body.insertRow();
    row.insertCell().textContent = dateFormatter.format(new Date(point.timestamp));
    row.insertCell().textContent = numberFormatter.format(point.value);
  }
  return table;
}
