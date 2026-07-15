import type { SupportedLocale } from './locales.js';

const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();

export function formatMoney(locale: SupportedLocale, value: number, currency: string): string {
  const key = `${locale}:${currency}`;
  let formatter = numberCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
    numberCache.set(key, formatter);
  }
  return formatter.format(value);
}

export function formatInstant(
  locale: SupportedLocale,
  instant: Date,
  timeZone: string,
): string {
  const key = `${locale}:${timeZone}`;
  let formatter = dateCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium', timeStyle: 'short', timeZone,
    });
    dateCache.set(key, formatter);
  }
  return formatter.format(instant);
}

export function formatList(locale: SupportedLocale, values: readonly string[]): string {
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(values);
}

export function compareLabels(locale: SupportedLocale, left: string, right: string): number {
  return new Intl.Collator(locale, { usage: 'sort', numeric: true, sensitivity: 'base' })
    .compare(left, right);
}
