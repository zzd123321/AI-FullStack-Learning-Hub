export type AssistantPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'citation'; readonly label: string; readonly url: string }
  | { readonly type: 'tool'; readonly callId: string; readonly name: string; readonly status: ToolStatus }
  | { readonly type: 'error'; readonly message: string };

export type ToolStatus =
  | 'arguments-streaming'
  | 'awaiting-approval'
  | 'running'
  | 'succeeded'
  | 'rejected'
  | 'failed';

export type GenerationStatus =
  | 'idle'
  | 'submitting'
  | 'streaming'
  | 'waiting-tool'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface GenerationState {
  readonly requestId: string | null;
  readonly status: GenerationStatus;
  readonly parts: readonly AssistantPart[];
  readonly error: string | null;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
}
