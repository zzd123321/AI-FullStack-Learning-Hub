export interface SafeLink {
  readonly href: string;
  readonly external: boolean;
  readonly rel: string | null;
}

export function normalizeLink(raw: string, origin: string): SafeLink | null {
  try {
    const base = new URL(origin);
    if (base.protocol !== 'https:' && base.protocol !== 'http:') return null;
    const url = new URL(raw, base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    const external = url.origin !== base.origin;
    return { href: url.href, external, rel: external ? 'noopener noreferrer' : null };
  } catch {
    return null;
  }
}
