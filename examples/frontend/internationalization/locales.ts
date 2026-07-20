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

    const desired = new Intl.Locale(candidate);
    // 只按 language 回退会把 zh-TW（通常为繁体）错误匹配到 zh-CN（简体）。
    // maximize() 用 CLDR likely-subtags 补出 Script；实际产品还应明确记录这项策略。
    const desiredScript = desired.maximize().script;
    const languageMatch = supportedLocales.find((locale) => {
      const supported = new Intl.Locale(locale);
      return supported.language === desired.language && supported.maximize().script === desiredScript;
    });
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
