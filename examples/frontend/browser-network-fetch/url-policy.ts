export interface UrlPolicy {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly allowedProtocols: ReadonlySet<string>;
}

export function resolveApiUrl(input: string, baseUrl: URL, policy: UrlPolicy): URL {
  const url = new URL(input, baseUrl);
  if (url.username || url.password) throw new Error("Credentials in URLs are not allowed");
  url.hash = "";

  if (!policy.allowedProtocols.has(url.protocol)) {
    throw new Error(`Protocol is not allowed: ${url.protocol}`);
  }
  if (!policy.allowedOrigins.has(url.origin)) {
    throw new Error(`Origin is not allowed: ${url.origin}`);
  }
  return url;
}

export function sameOrigin(left: URL, right: URL): boolean {
  return left.origin === right.origin;
}
