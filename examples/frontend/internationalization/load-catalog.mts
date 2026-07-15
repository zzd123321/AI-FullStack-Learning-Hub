import type { CatalogBundle } from './catalog.ts';
import type { SupportedLocale } from './locales.ts';

const loaders: Record<SupportedLocale, () => Promise<{ default: CatalogBundle['messages'] }>> = {
  'zh-CN': () => import('./messages/zh-CN.json', { with: { type: 'json' } }),
  'en-US': () => import('./messages/en-US.json', { with: { type: 'json' } }),
  ar: () => import('./messages/ar.json', { with: { type: 'json' } }),
};

export async function loadCatalog(locale: SupportedLocale): Promise<CatalogBundle> {
  const module = await loaders[locale]();
  return { locale, revision: '2026-07-15.1', messages: module.default };
}
