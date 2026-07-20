import type { SupportedLocale } from './locales.js';

const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();
const listCache = new Map<SupportedLocale, Intl.ListFormat>();
const collatorCache = new Map<SupportedLocale, Intl.Collator>();

export function formatMoney(locale: SupportedLocale, value: number, currency: string): string {
  if (!Number.isFinite(value)) throw new RangeError('Money value must be finite');
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
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Instant must be a valid Date');
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
  let formatter = listCache.get(locale);
  if (!formatter) {
    formatter = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
    listCache.set(locale, formatter);
  }
  return formatter.format(values);
}

export function compareLabels(locale: SupportedLocale, left: string, right: string): number {
  let formatter = collatorCache.get(locale);
  if (!formatter) {
    formatter = new Intl.Collator(locale, { usage: 'sort', numeric: true, sensitivity: 'base' });
    collatorCache.set(locale, formatter);
  }
  return formatter.compare(left, right);
}
