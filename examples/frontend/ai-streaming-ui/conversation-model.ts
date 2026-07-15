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

export function retryUserTurn(turn: ConversationTurn): ConversationTurn {
  if (turn.role !== 'user' || turn.status !== 'failed') throw new Error('Only failed user turns can retry');
  return { ...turn, status: 'pending' };
}
