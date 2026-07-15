import { localeMetadata, type SupportedLocale } from './locales.js';

export function applyDocumentLocale(locale: SupportedLocale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = localeMetadata[locale].direction;
}

export function isolateUserText(value: string): HTMLElement {
  const element = document.createElement('bdi');
  element.textContent = value;
  return element;
}
