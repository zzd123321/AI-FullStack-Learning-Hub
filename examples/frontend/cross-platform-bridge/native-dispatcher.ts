import { parseBridgeRequest, type BridgeResponse } from './bridge-protocol.js';

export interface NativeCapabilities {
  readonly openExternal: (url: URL) => Promise<void>;
  readonly selectFile: (accept: readonly string[]) => Promise<readonly string[]>;
}

const reply = (id: string, result: unknown): BridgeResponse => ({ version: 1, id, ok: true, result });

export async function dispatchBridgeMessage(
  raw: unknown,
  capabilities: NativeCapabilities,
): Promise<BridgeResponse> {
  const request = parseBridgeRequest(raw);
  if (!request) return { version: 1, id: 'unknown', ok: false, error: { code: 'INVALID_REQUEST', message: 'Invalid bridge request' } };
  try {
    switch (request.method) {
      case 'app.getCapabilities': return reply(request.id, { openExternal: true, selectFile: true });
      case 'shell.openExternal': {
        const url = new URL(request.params.url);
        if (!['https:', 'mailto:'].includes(url.protocol)) throw new Error('URL scheme is not allowed');
        await capabilities.openExternal(url);
        return reply(request.id, null);
      }
      case 'dialog.selectFile': {
        const allowed = request.params.accept.filter((type) => /^\.[a-z0-9]+$|^[a-z]+\/[a-z0-9.+*-]+$/i.test(type));
        return reply(request.id, await capabilities.selectFile(allowed));
      }
    }
  } catch (error) {
    return { version: 1, id: request.id, ok: false, error: {
      code: 'CAPABILITY_FAILED', message: error instanceof Error ? error.message : 'Native capability failed',
    } };
  }
}
