export interface DownloadGrant {
  readonly url: string;
  readonly expiresAt: number;
  readonly sha256?: string;
}

export function resolveDownloadUrl(
  grant: DownloadGrant,
  allowedOrigins: ReadonlySet<string>,
  now = Date.now(),
): URL | null {
  if (grant.expiresAt <= now) return null;
  try {
    const url = new URL(grant.url);
    return url.protocol === 'https:' && !url.username && !url.password
      && allowedOrigins.has(url.origin) ? url : null;
  } catch {
    return null;
  }
}
