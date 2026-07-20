export type VoicePhase =
  | 'idle'
  | 'requesting-permission'
  | 'connecting'
  | 'listening'
  | 'user-speaking'
  | 'assistant-thinking'
  | 'assistant-speaking'
  | 'interrupting'
  | 'failed'
  | 'ended';

export interface VoiceSessionState {
  readonly sessionId: string | null;
  readonly phase: VoicePhase;
  readonly muted: boolean;
  readonly audioPlaybackBlocked: boolean;
  readonly activeResponseId: string | null;
  readonly activeAudioItemId: string | null;
  readonly error: string | null;
}

export type TranscriptSegment =
  | { readonly id: string; readonly speaker: 'user' | 'assistant'; readonly status: 'partial'; readonly text: string }
  | { readonly id: string; readonly speaker: 'user' | 'assistant'; readonly status: 'final'; readonly text: string };
