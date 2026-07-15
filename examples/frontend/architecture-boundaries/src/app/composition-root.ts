import { createCatalogFeature } from '../features/catalog/index.js';

export interface PublicRuntimeConfig {
  readonly apiBaseUrl: string;
  readonly locale: string;
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
