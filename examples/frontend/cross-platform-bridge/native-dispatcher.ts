import {
  parseBridgeRequest,
  type BridgeErrorCode,
  type BridgeResponse,
} from './bridge-protocol.js';

// The page receives opaque IDs and display metadata, never unrestricted paths.
export interface SelectedFile {
  readonly token: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface NativeCapabilities {
  readonly openExternal: (url: URL) => Promise<void>;
  readonly selectFile: (accept: readonly string[]) => Promise<readonly SelectedFile[]>;
}

export interface DispatchPolicy {
  // The Electron/WebView adapter determines this from the real sender frame,
  // expected window and current origin—not from fields supplied by the page.
  readonly authorizedSender: boolean;
  readonly allowedExternalOrigins: ReadonlySet<string>;
}

export class NativeCapabilityError extends Error {
  constructor(readonly code: 'UNSUPPORTED' | 'USER_CANCELLED' | 'NATIVE_FAILURE') {
    super(code);
    this.name = 'NativeCapabilityError';
  }
}

const success = (id: string, result: unknown): BridgeResponse =>
  ({ version: 1, id, ok: true, result });

const failure = (id: string, code: BridgeErrorCode, message: string): BridgeResponse =>
  ({ version: 1, id, ok: false, error: { code, message } });

function parseAllowedExternalUrl(raw: string, allowedOrigins: ReadonlySet<string>): URL | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }

  if (url.username || url.password) return null;
  if (url.protocol !== 'https:' || !allowedOrigins.has(url.origin)) return null;
  return url;
}

export async function dispatchBridgeMessage(
  raw: unknown,
  capabilities: NativeCapabilities,
  policy: DispatchPolicy,
): Promise<BridgeResponse> {
  const request = parseBridgeRequest(raw);
  if (!request) return failure('unknown', 'INVALID_REQUEST', 'Invalid bridge request');
  if (!policy.authorizedSender) return failure(request.id, 'UNAUTHORIZED', 'Bridge sender is not authorized');

  try {
    switch (request.method) {
      case 'app.getCapabilities':
        return success(request.id, {
          protocolVersion: 1,
          openExternal: { version: 1 },
          selectFile: { version: 1 },
        });

      case 'shell.openExternal': {
        const url = parseAllowedExternalUrl(request.params.url, policy.allowedExternalOrigins);
        if (!url) return failure(request.id, 'INVALID_ARGUMENT', 'External URL is not allowed');
        await capabilities.openExternal(url);
        return success(request.id, null);
      }

      case 'dialog.selectFile':
        return success(request.id, await capabilities.selectFile(request.params.accept));
    }
  } catch (error) {
    // Map platform-specific exceptions to stable codes in a real adapter. Do
    // not return native stack traces, local paths, or exception serialization.
    const code = error instanceof NativeCapabilityError ? error.code : 'NATIVE_FAILURE';
    const message = code === 'USER_CANCELLED'
      ? 'User cancelled the native operation'
      : code === 'UNSUPPORTED'
        ? 'Native capability is not supported'
        : 'Native capability failed';
    return failure(request.id, code, message);
  }
}
