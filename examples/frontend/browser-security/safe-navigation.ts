const TRUSTED_DOWNLOAD_ORIGINS = new Set([
  "https://learn.example.com",
  "https://cdn.example.com",
]);

export function parseTrustedDownloadUrl(raw: string): URL | null {
  try {
    const url = new URL(raw, location.href);
    if (url.protocol !== "https:" || !TRUSTED_DOWNLOAD_ORIGINS.has(url.origin)) return null;
    return url;
  } catch {
    return null;
  }
}

export function configureExternalLink(anchor: HTMLAnchorElement, raw: string): boolean {
  const url = parseTrustedDownloadUrl(raw);
  if (!url) {
    anchor.removeAttribute("href");
    return false;
  }
  anchor.href = url.href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return true;
}
