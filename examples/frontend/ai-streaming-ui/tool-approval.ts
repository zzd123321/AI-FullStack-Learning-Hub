export interface ToolProposal {
  readonly callId: string;
  readonly name: string;
  readonly summary: string;
  readonly risk: 'read' | 'write' | 'destructive';
  readonly arguments: Readonly<Record<string, unknown>>;
}

const clientVisibleTools = new Set(['search_courses', 'create_learning_plan', 'send_notification']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseToolProposal(value: unknown): ToolProposal {
  if (!isRecord(value)) throw new TypeError('Tool proposal must be an object');
  if (typeof value.name !== 'string' || !clientVisibleTools.has(value.name)) {
    throw new TypeError('Unknown tool');
  }
  if (typeof value.callId !== 'string' || value.callId === '') throw new TypeError('Missing call ID');
  if (typeof value.summary !== 'string' || value.summary === '' || value.summary.length > 500) {
    throw new TypeError('Invalid tool summary');
  }
  if (!['read', 'write', 'destructive'].includes(String(value.risk))) {
    throw new TypeError('Invalid tool risk');
  }
  if (!isRecord(value.arguments)) throw new TypeError('Invalid tool arguments');

  return value as unknown as ToolProposal;
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
