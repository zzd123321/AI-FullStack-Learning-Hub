export type UploadPhase =
  | 'idle'
  | 'validating'
  | 'creating-session'
  | 'uploading'
  | 'paused'
  | 'completing'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface UploadState {
  readonly phase: UploadPhase;
  readonly uploadId: string | null;
  readonly assetId: string | null;
  readonly uploadedBytes: number;
  readonly totalBytes: number;
  readonly error: string | null;
}

export interface UploadPart {
  readonly partNumber: number;
  readonly start: number;
  readonly end: number;
  readonly size: number;
}

export interface CompletedPart {
  readonly partNumber: number;
  readonly etag: string;
}

export interface UploadSession {
  readonly uploadId: string;
  readonly assetId: string;
  readonly partSize: number;
  readonly completedParts: readonly CompletedPart[];
}
