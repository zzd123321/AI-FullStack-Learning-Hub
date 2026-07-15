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
      readonly streamSequence: number;
      readonly commandId: string;
      readonly code: 'stale-revision' | 'forbidden' | 'invalid';
      readonly document: CollaborativeDocument;
    }
  | {
      readonly type: 'presence';
      readonly protocolVersion: 1;
      readonly streamSequence: number;
      readonly clientId: string;
      readonly displayName: string;
      readonly expiresAt: number;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseServerEvent(raw: string): ServerEvent {
  const value: unknown = JSON.parse(raw);
  if (
    !isRecord(value) ||
    value.protocolVersion !== 1 ||
    typeof value.type !== 'string' ||
    !Number.isSafeInteger(value.streamSequence) ||
    Number(value.streamSequence) < 0
  ) {
    throw new TypeError('Invalid realtime event envelope');
  }

  // Production code should validate each variant with a shared runtime schema.
  if (!['snapshot', 'document-changed', 'command-rejected', 'presence'].includes(value.type)) {
    throw new TypeError(`Unknown realtime event type: ${value.type}`);
  }
  return value as unknown as ServerEvent;
}
