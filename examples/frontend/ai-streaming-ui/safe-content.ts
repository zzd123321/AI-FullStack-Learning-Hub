export function safeExternalUrl(raw: string, base = location.origin): string | null {
  try {
    const url = new URL(raw, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
export function renderPlainText(container: HTMLElement, text: string): void {
  // textContent never interprets model output as HTML.
  container.textContent = text;
}

export function openExternalLink(anchor: HTMLAnchorElement, url: string): void {
  const safe = safeExternalUrl(url);
  if (!safe) throw new Error('Unsafe external URL');
  anchor.href = safe;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
}
