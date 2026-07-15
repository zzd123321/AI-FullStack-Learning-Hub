interface TrustedTypePolicyLike {
  createHTML(input: string): unknown;
}

interface TrustedTypePolicyFactoryLike {
  createPolicy(
    name: string,
    rules: { readonly createHTML: (input: string) => string },
  ): TrustedTypePolicyLike;
}

type WindowWithTrustedTypes = Window & {
  readonly trustedTypes?: TrustedTypePolicyFactoryLike;
};

export type HtmlSanitizer = (untrustedHtml: string) => string;

export function createHtmlPolicy(sanitize: HtmlSanitizer): TrustedTypePolicyLike {
  const factory = (window as WindowWithTrustedTypes).trustedTypes;
  if (factory) {
    return factory.createPolicy("app-html", { createHTML: sanitize });
  }
  // 不支持 Trusted Types 的浏览器仍统一经过同一个清洗入口。
  return { createHTML: sanitize };
}

export function renderSanitizedHtml(
  container: HTMLElement,
  untrustedHtml: string,
  policy: TrustedTypePolicyLike,
): void {
  const trustedOrSanitized = policy.createHTML(untrustedHtml);
  // lib.dom 尚未在所有 TS 版本中把 TrustedHTML 纳入 innerHTML 类型。
  (container as unknown as { innerHTML: unknown }).innerHTML = trustedOrSanitized;
}
