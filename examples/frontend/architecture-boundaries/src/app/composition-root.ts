import { createCatalogFeature } from '../features/catalog/index.js';

export interface PublicRuntimeConfig {
  readonly apiBaseUrl: URL;
  readonly locale: string;
}

export function parsePublicRuntimeConfig(value: unknown, origin: string): PublicRuntimeConfig {
  if (typeof value !== 'object' || value === null) throw new TypeError('Invalid runtime config');
  const record = value as Record<string, unknown>;
  if (typeof record.apiBaseUrl !== 'string' || typeof record.locale !== 'string') {
    throw new TypeError('Invalid runtime config');
  }

  const apiBaseUrl = new URL(record.apiBaseUrl, origin);
  if (apiBaseUrl.protocol !== 'https:' && apiBaseUrl.origin !== origin) {
    throw new TypeError('Cross-origin API base URL must use HTTPS');
  }
  if (!apiBaseUrl.pathname.endsWith('/')) {
    throw new TypeError('API base URL pathname must end with "/"');
  }

  // Intl 会对非法 locale 抛 RangeError；在装配阶段失败比渲染到一半更清楚。
  const [locale] = Intl.getCanonicalLocales(record.locale);
  if (!locale) throw new TypeError('Locale is required');

  return { apiBaseUrl, locale };
}

export function createApplication(config: PublicRuntimeConfig) {
  const catalog = createCatalogFeature({
    apiBaseUrl: config.apiBaseUrl,
    fetch: window.fetch.bind(window),
    locale: config.locale,
    now: () => new Date(),
  });

  return Object.freeze({ catalog });
}
