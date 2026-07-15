export interface ToolProposal {
  readonly callId: string;
  readonly name: string;
  readonly summary: string;
  readonly risk: 'read' | 'write' | 'destructive';
  readonly arguments: Readonly<Record<string, unknown>>;
}
const clientVisibleTools = new Set(['search_courses', 'create_learning_plan', 'send_notification']);

export function validateToolProposal(value: ToolProposal): ToolProposal {
  if (!clientVisibleTools.has(value.name)) throw new Error('Unknown tool');
  if (!value.callId || !value.summary) throw new Error('Incomplete tool proposal');
  return value;
}

export function requiresConfirmation(proposal: ToolProposal): boolean {
  return proposal.risk !== 'read';
}

// The browser returns an approval decision; only the trusted backend executes tools.
export interface ToolDecision {
  readonly callId: string;
  readonly approved: boolean;
  readonly idempotencyKey: string;
}
