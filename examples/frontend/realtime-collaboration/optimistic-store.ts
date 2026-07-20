import type { ClientCommand, CollaborativeDocument, DocumentPatch } from './protocol.js';

export interface OptimisticState {
  readonly confirmed: CollaborativeDocument;
  readonly pending: readonly ClientCommand[];
  readonly visible: CollaborativeDocument;
  readonly lastError: string | null;
}
function applyPatch(document: CollaborativeDocument, patch: DocumentPatch): CollaborativeDocument {
  switch (patch.type) {
    case 'set-title':
      return { ...document, title: patch.title };
    case 'set-status':
      return { ...document, status: patch.status };
  }
}

function replay(
  confirmed: CollaborativeDocument,
  pending: readonly ClientCommand[],
): CollaborativeDocument {
  return pending.reduce(
    (document, command) => applyPatch(document, command.patch),
    confirmed,
  );
}

function assertSameDocument(state: OptimisticState, documentId: string): void {
  if (documentId !== state.confirmed.id) {
    throw new Error(`Command/document mismatch: expected ${state.confirmed.id}, received ${documentId}`);
  }
}

function assertNewerBaseline(
  state: OptimisticState,
  document: CollaborativeDocument,
): void {
  assertSameDocument(state, document.id);
  if (document.revision < state.confirmed.revision) {
    throw new RangeError('Server document revision cannot move backwards');
  }
}

function samePatch(left: DocumentPatch, right: DocumentPatch): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'set-title' && right.type === 'set-title') return left.title === right.title;
  if (left.type === 'set-status' && right.type === 'set-status') return left.status === right.status;
  return false;
}

function sameCommand(left: ClientCommand, right: ClientCommand): boolean {
  return left.protocolVersion === right.protocolVersion &&
    left.commandId === right.commandId &&
    left.documentId === right.documentId &&
    left.baseRevision === right.baseRevision &&
    samePatch(left.patch, right.patch);
}

export function initializeOptimisticState(document: CollaborativeDocument): OptimisticState {
  return { confirmed: document, pending: [], visible: document, lastError: null };
}

export function enqueueCommand(
  state: OptimisticState,
  command: ClientCommand,
): OptimisticState {
  assertSameDocument(state, command.documentId);
  const duplicate = state.pending.find((item) => item.commandId === command.commandId);
  if (duplicate) {
    if (!sameCommand(duplicate, command)) {
      throw new Error(`commandId collision: ${command.commandId}`);
    }
    return state;
  }
  const pending = [...state.pending, command];
  return { ...state, pending, visible: replay(state.confirmed, pending), lastError: null };
}

export function confirmServerDocument(
  state: OptimisticState,
  confirmed: CollaborativeDocument,
  acknowledgedCommandId: string | null,
): OptimisticState {
  assertNewerBaseline(state, confirmed);
  const pending = acknowledgedCommandId
    ? state.pending.filter((command) => command.commandId !== acknowledgedCommandId)
    : state.pending;
  return { ...state, confirmed, pending, visible: replay(confirmed, pending) };
}

export function rejectCommand(
  state: OptimisticState,
  commandId: string,
  serverDocument: CollaborativeDocument,
  reason: string,
): OptimisticState {
  assertNewerBaseline(state, serverDocument);
  const pending = state.pending.filter((command) => command.commandId !== commandId);
  return {
    confirmed: serverDocument,
    pending,
    visible: replay(serverDocument, pending),
    lastError: reason,
  };
}
