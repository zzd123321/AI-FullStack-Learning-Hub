export interface CollaborativeDocument {
  readonly id: string;
  readonly title: string;
  readonly status: 'draft' | 'published';
  readonly revision: number;
}
export type DocumentPatch =
  | { readonly type: 'set-title'; readonly title: string }
  | { readonly type: 'set-status'; readonly status: CollaborativeDocument['status'] };

export interface ClientCommand {
  readonly type: 'command';
  readonly protocolVersion: 1;
  readonly commandId: string;
  readonly documentId: string;
  readonly baseRevision: number;
  readonly patch: DocumentPatch;
}

export type ServerEvent =
  | {
      readonly type: 'snapshot';
      readonly protocolVersion: 1;
      readonly streamSequence: number;
      readonly document: CollaborativeDocument;
    }
  | {
      readonly type: 'document-changed';
      readonly protocolVersion: 1;
      readonly streamSequence: number;
      readonly commandId: string | null;
      readonly document: CollaborativeDocument;
    }
  | {
      readonly type: 'command-rejected';
      readonly protocolVersion: 1;
      readonly commandId: string;
      readonly code: 'stale-revision' | 'forbidden' | 'invalid';
      readonly document: CollaborativeDocument;
    }
  | {
      readonly type: 'presence';
      readonly protocolVersion: 1;
      readonly clientId: string;
      readonly displayName: string;
      /** 每个 client 独立递增；Presence 不占用可恢复文档流的 sequence。 */
      readonly presenceVersion: number;
      readonly expiresAt: number;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isDocument(value: unknown): value is CollaborativeDocument {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.title === 'string' &&
    (value.status === 'draft' || value.status === 'published') &&
    isNonNegativeSafeInteger(value.revision);
}

function assertDurableEnvelope(value: Record<string, unknown>): void {
  if (!isNonNegativeSafeInteger(value.streamSequence)) {
    throw new TypeError('Durable realtime event requires a non-negative streamSequence');
  }
}

export function parseServerEvent(raw: string): ServerEvent {
  const value: unknown = JSON.parse(raw);
  if (
    !isRecord(value) ||
    value.protocolVersion !== 1 ||
    typeof value.type !== 'string'
  ) {
    throw new TypeError('Invalid realtime event envelope');
  }

  switch (value.type) {
    case 'snapshot':
      assertDurableEnvelope(value);
      if (!isDocument(value.document)) throw new TypeError('Invalid snapshot document');
      return value as unknown as Extract<ServerEvent, { type: 'snapshot' }>;
    case 'document-changed':
      assertDurableEnvelope(value);
      if (
        !isDocument(value.document) ||
        !(isNonEmptyString(value.commandId) || value.commandId === null)
      ) throw new TypeError('Invalid document-changed event');
      return value as unknown as Extract<ServerEvent, { type: 'document-changed' }>;
    case 'command-rejected':
      if (
        !isNonEmptyString(value.commandId) ||
        !['stale-revision', 'forbidden', 'invalid'].includes(String(value.code)) ||
        !isDocument(value.document)
      ) throw new TypeError('Invalid command-rejected event');
      return value as unknown as Extract<ServerEvent, { type: 'command-rejected' }>;
    case 'presence':
      if (
        !isNonEmptyString(value.clientId) ||
        typeof value.displayName !== 'string' ||
        !isNonNegativeSafeInteger(value.presenceVersion) ||
        !Number.isFinite(value.expiresAt)
      ) throw new TypeError('Invalid presence event');
      return value as unknown as Extract<ServerEvent, { type: 'presence' }>;
    default:
      throw new TypeError(`Unknown realtime event type: ${value.type}`);
  }
}
