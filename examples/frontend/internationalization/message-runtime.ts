import type { CatalogBundle, MessageParameters, MessageValue } from './catalog.js';
import { localeMetadata, type SupportedLocale } from './locales.js';

function interpolate(pattern: string, parameters: MessageParameters): string {
  return pattern.replace(/\{([A-Za-z][\w]*)\}/g, (_, name: string) => {
    if (!(name in parameters)) throw new Error(`Missing message parameter: ${name}`);
    return String(parameters[name]);
  });
}

export function createTranslator(
  locale: SupportedLocale,
  bundles: ReadonlyMap<SupportedLocale, CatalogBundle>,
  onMissing: (locale: SupportedLocale, key: string) => void,
  onFallback: (requested: SupportedLocale, resolved: SupportedLocale, key: string) => void = () => {},
) {
  const locales = [locale, ...localeMetadata[locale].fallback];
  const findMessage = (key: string): readonly [SupportedLocale, MessageValue] | undefined => {
    for (const candidate of locales) {
      const message = bundles.get(candidate)?.messages[key];
      if (message !== undefined) return [candidate, message];
    }
    return undefined;
  };

  return (key: string, parameters: MessageParameters = {}): string => {
    const found = findMessage(key);
    if (!found) { onMissing(locale, key); return `⟦${key}⟧`; }
    const [resolvedLocale, message] = found;
    if (resolvedLocale !== locale) onFallback(locale, resolvedLocale, key);
    if (typeof message === 'string') return interpolate(message, parameters);
    const count = parameters.count;
    if (typeof count !== 'number') throw new Error(`Plural message requires numeric count: ${key}`);
    // 如果消息来自回退 Catalog，复数规则也必须跟随消息语言。
    const category = new Intl.PluralRules(resolvedLocale).select(count);
    const pattern = message[category] ?? message.other;
    if (!pattern) throw new Error(`Plural message lacks category "${category}" and "other": ${key}`);
    return interpolate(pattern, parameters);
  };
}
