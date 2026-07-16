export type JobPhase =
  | 'queued' | 'validating' | 'awaiting_confirmation' | 'running'
  | 'cancel_requested' | 'canceled' | 'succeeded' | 'partially_succeeded' | 'failed' | 'expired';

export interface JobView {
  readonly jobId: string;
  readonly phase: JobPhase;
  readonly version: number;
  readonly processedRows: number;
  readonly totalRows: number | null;
  readonly succeededRows: number;
  readonly failedRows: number;
  readonly messageCode?: string;
}

export function applyJobSnapshot(current: JobView, incoming: JobView): JobView {
  if (incoming.jobId !== current.jobId) throw new TypeError('Job mismatch');
  return incoming.version > current.version ? incoming : current;
}

export const canRequestCancel = (phase: JobPhase): boolean =>
  phase === 'queued' || phase === 'validating' || phase === 'running';

export const isJobTerminal = (phase: JobPhase): boolean =>
  phase === 'canceled' || phase === 'succeeded' || phase === 'partially_succeeded'
  || phase === 'failed' || phase === 'expired';
