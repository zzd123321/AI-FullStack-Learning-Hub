export type FormulaPolicy = 'reject' | 'prefix-tab';

const FORMULA_PREFIX = /^[\u0000-\u0020]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/u;

export function encodeCsvCell(value: string, formulaPolicy: FormulaPolicy): string {
  let safeValue = value;
  if (FORMULA_PREFIX.test(safeValue)) {
    if (formulaPolicy === 'reject') throw new TypeError('Potential spreadsheet formula');
    safeValue = `\t${safeValue}`;
  }
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function encodeCsvRow(values: readonly string[], formulaPolicy: FormulaPolicy): string {
  return `${values.map((value) => encodeCsvCell(value, formulaPolicy)).join(',')}\r\n`;
}
