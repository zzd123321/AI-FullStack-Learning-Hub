export interface ConversationTurn {
  readonly clientTurnId: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly status: 'pending' | 'confirmed' | 'failed';
  readonly providerResponseId: string | null;
}

export function shouldPersist(turn: ConversationTurn): boolean {
  return turn.status === 'confirmed';
}

// Retrying transport delivery keeps the same client ID so the backend can
// deduplicate it. Regenerating an assistant answer is a different operation:
// it should create a new assistant branch with a new ID.
export function retryFailedUserDelivery(turn: ConversationTurn): ConversationTurn {
  if (turn.role !== 'user' || turn.status !== 'failed') throw new Error('Only failed user turns can retry');
  return { ...turn, status: 'pending', providerResponseId: null };
}
