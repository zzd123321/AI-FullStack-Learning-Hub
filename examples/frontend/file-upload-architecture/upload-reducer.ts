import type { UploadState } from './types.js';

export type UploadAction =
  | { readonly type: 'select'; readonly totalBytes: number }
  | { readonly type: 'validated' }
  | { readonly type: 'session-created'; readonly uploadId: string; readonly assetId: string }
  | { readonly type: 'progress'; readonly uploadedBytes: number }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'parts-uploaded' }
  | { readonly type: 'asset-processing' }
  | { readonly type: 'asset-ready' }
  | { readonly type: 'fail'; readonly message: string }
  | { readonly type: 'cancel' };

export const initialUploadState: UploadState = {
  phase: 'idle', uploadId: null, assetId: null,
  uploadedBytes: 0, totalBytes: 0, error: null,
};

export function reduceUpload(state: UploadState, action: UploadAction): UploadState {
  if (action.type === 'select') {
    if (!Number.isSafeInteger(action.totalBytes) || action.totalBytes < 0) return state;
    return {
      ...initialUploadState, phase: 'validating', totalBytes: action.totalBytes,
    };
  }
  if (['completed', 'failed', 'cancelled'].includes(state.phase)) return state;
  if (action.type === 'fail') return state.phase === 'idle'
    ? state : { ...state, phase: 'failed', error: action.message };
  if (action.type === 'cancel') return state.phase === 'idle'
    ? state : { ...state, phase: 'cancelled' };
  switch (action.type) {
    case 'validated': return state.phase === 'validating'
      ? { ...state, phase: 'creating-session' } : state;
    case 'session-created': return state.phase === 'creating-session'
      && action.uploadId !== '' && action.assetId !== ''
      ? { ...state, phase: 'uploading', uploadId: action.uploadId, assetId: action.assetId } : state;
    case 'progress': return state.phase === 'uploading' && Number.isFinite(action.uploadedBytes)
      ? { ...state, uploadedBytes: Math.max(0, Math.min(state.totalBytes, action.uploadedBytes)) } : state;
    case 'pause': return state.phase === 'uploading' ? { ...state, phase: 'paused' } : state;
    case 'resume': return state.phase === 'paused' ? { ...state, phase: 'uploading' } : state;
    case 'parts-uploaded': return state.phase === 'uploading'
      ? { ...state, phase: 'completing', uploadedBytes: state.totalBytes } : state;
    case 'asset-processing': return state.phase === 'completing'
      ? { ...state, phase: 'processing' } : state;
    case 'asset-ready': return state.phase === 'processing'
      ? { ...state, phase: 'completed' } : state;
    default: return state;
  }
}
