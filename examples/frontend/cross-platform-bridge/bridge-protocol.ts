export type BridgeRequest =
  | { readonly version: 1; readonly id: string; readonly method: 'app.getCapabilities'; readonly params: Record<string, never> }
  | { readonly version: 1; readonly id: string; readonly method: 'shell.openExternal'; readonly params: { readonly url: string } }
  | { readonly version: 1; readonly id: string; readonly method: 'dialog.selectFile'; readonly params: { readonly accept: readonly string[] } };

export type BridgeErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_ARGUMENT'
  | 'UNAUTHORIZED'
  | 'UNSUPPORTED'
  | 'USER_CANCELLED'
  | 'NATIVE_FAILURE'
  | 'VERSION_MISMATCH';

export type BridgeResponse =
  | { readonly version: 1; readonly id: string; readonly ok: true; readonly result: unknown }
  | { readonly version: 1; readonly id: string; readonly ok: false; readonly error: { readonly code: BridgeErrorCode; readonly message: string } };

const ERROR_CODES = new Set<BridgeErrorCode>([
  'INVALID_REQUEST', 'INVALID_ARGUMENT', 'UNAUTHORIZED', 'UNSUPPORTED',
  'USER_CANCELLED', 'NATIVE_FAILURE', 'VERSION_MISMATCH',
]);

const ACCEPT_PATTERN = /^\.[a-z0-9]+$|^[a-z]+\/[a-z0-9.+*-]+$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

export function parseBridgeRequest(value: unknown): BridgeRequest | null {
  if (!isRecord(value) || value.version !== 1 || !isValidId(value.id)
    || typeof value.method !== 'string' || !isRecord(value.params)
    || !hasOnlyKeys(value, ['version', 'id', 'method', 'params'])) return null;

  if (value.method === 'app.getCapabilities') {
    if (Object.keys(value.params).length !== 0) return null;
    return { version: 1, id: value.id, method: value.method, params: {} };
  }

  if (value.method === 'shell.openExternal') {
    if (!hasOnlyKeys(value.params, ['url'])) return null;
    const url = value.params.url;
    if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return null;
    return { version: 1, id: value.id, method: value.method, params: { url } };
  }

  if (value.method === 'dialog.selectFile') {
    if (!hasOnlyKeys(value.params, ['accept'])) return null;
    const accept = value.params.accept;
    if (!Array.isArray(accept) || accept.length > 20
      || !accept.every((item) => typeof item === 'string' && item.length <= 128 && ACCEPT_PATTERN.test(item))) {
      return null;
    }
    return { version: 1, id: value.id, method: value.method, params: { accept: [...new Set(accept)] } };
  }

  return null;
}

export function parseBridgeResponse(value: unknown): BridgeResponse | null {
  if (!isRecord(value) || value.version !== 1 || !isValidId(value.id)
    || typeof value.ok !== 'boolean') return null;

  if (value.ok) {
    if (!('result' in value)) return null;
    return { version: 1, id: value.id, ok: true, result: value.result };
  }

  if (!isRecord(value.error) || typeof value.error.code !== 'string'
    || !ERROR_CODES.has(value.error.code as BridgeErrorCode)
    || typeof value.error.message !== 'string' || value.error.message.length > 512) return null;
  return {
    version: 1,
    id: value.id,
    ok: false,
    error: { code: value.error.code as BridgeErrorCode, message: value.error.message },
  };
}
