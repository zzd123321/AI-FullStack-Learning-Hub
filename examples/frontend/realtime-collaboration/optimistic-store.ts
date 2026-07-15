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

export function initializeOptimisticState(document: CollaborativeDocument): OptimisticState {
  return { confirmed: document, pending: [], visible: document, lastError: null };
}

export function enqueueCommand(
  state: OptimisticState,
  command: ClientCommand,
): OptimisticState {
  if (state.pending.some((item) => item.commandId === command.commandId)) return state;
  const pending = [...state.pending, command];
  return { ...state, pending, visible: replay(state.confirmed, pending), lastError: null };
}

export function confirmServerDocument(
  state: OptimisticState,
  confirmed: CollaborativeDocument,
  acknowledgedCommandId: string | null,
): OptimisticState {
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
  const pending = state.pending.filter((command) => command.commandId !== commandId);
  return {
    confirmed: serverDocument,
    pending,
    visible: replay(serverDocument, pending),
    lastError: reason,
  };
}
