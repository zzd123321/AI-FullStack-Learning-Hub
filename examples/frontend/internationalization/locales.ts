export const supportedLocales = ['zh-CN', 'en-US', 'ar'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export const defaultLocale: SupportedLocale = 'zh-CN';

export function negotiateLocale(requested: readonly string[]): SupportedLocale {
  const canonical = requested.flatMap((value) => {
    try { return Intl.getCanonicalLocales(value); } catch { return []; }
  });
  for (const candidate of canonical) {
    const exact = supportedLocales.find((locale) => locale === candidate);
    if (exact) return exact;
    const language = new Intl.Locale(candidate).language;
    const languageMatch = supportedLocales.find(
      (locale) => new Intl.Locale(locale).language === language,
    );
    if (languageMatch) return languageMatch;
  }
  return defaultLocale;
}

export const localeMetadata: Readonly<Record<SupportedLocale, {
  readonly direction: 'ltr' | 'rtl';
  readonly fallback: readonly SupportedLocale[];
}>> = {
  'zh-CN': { direction: 'ltr', fallback: [] },
  'en-US': { direction: 'ltr', fallback: ['zh-CN'] },
  ar: { direction: 'rtl', fallback: ['en-US', 'zh-CN'] },
};
