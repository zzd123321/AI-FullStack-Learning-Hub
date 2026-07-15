import type { SupportedLocale } from './locales.js';

export interface SerializedLocaleState {
  readonly locale: SupportedLocale;
  readonly timeZone: string;
  readonly catalogRevision: string;
}

export function serializeLocaleState(state: SerializedLocaleState): string {
  return JSON.stringify(state)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function initialDocumentAttributes(state: SerializedLocaleState, direction: 'ltr' | 'rtl') {
  return { lang: state.locale, dir: direction, 'data-catalog-revision': state.catalogRevision };
}
