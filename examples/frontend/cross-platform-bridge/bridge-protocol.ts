export type BridgeRequest =
  | { readonly version: 1; readonly id: string; readonly method: 'app.getCapabilities'; readonly params: Record<string, never> }
  | { readonly version: 1; readonly id: string; readonly method: 'shell.openExternal'; readonly params: { readonly url: string } }
  | { readonly version: 1; readonly id: string; readonly method: 'dialog.selectFile'; readonly params: { readonly accept: readonly string[] } };

export type BridgeResponse =
  | { readonly version: 1; readonly id: string; readonly ok: true; readonly result: unknown }
  | { readonly version: 1; readonly id: string; readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export function parseBridgeRequest(value: unknown): BridgeRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || typeof item.id !== 'string' || item.id.length > 128
    || typeof item.method !== 'string' || typeof item.params !== 'object' || item.params === null) return null;
  if (item.method === 'app.getCapabilities') return item as BridgeRequest;
  if (item.method === 'shell.openExternal') {
    const url = (item.params as Record<string, unknown>).url;
    return typeof url === 'string' && url.length <= 2048 ? item as BridgeRequest : null;
  }
  if (item.method === 'dialog.selectFile') {
    const accept = (item.params as Record<string, unknown>).accept;
    return Array.isArray(accept) && accept.length <= 20 && accept.every((v) => typeof v === 'string')
      ? item as BridgeRequest : null;
  }
  return null;
}
