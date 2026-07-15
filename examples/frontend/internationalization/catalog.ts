import type { SupportedLocale } from './locales.js';

export type PluralMessage = Readonly<{ other: string }> &
  Readonly<Partial<Record<Exclude<Intl.LDMLPluralRule, 'other'>, string>>>;
export type MessageValue = string | PluralMessage;
export type MessageCatalog = Readonly<Record<string, MessageValue>>;

export interface CatalogBundle {
  readonly locale: SupportedLocale;
  readonly revision: string;
  readonly messages: MessageCatalog;
}

export type MessageParameters = Readonly<Record<string, string | number>>;
