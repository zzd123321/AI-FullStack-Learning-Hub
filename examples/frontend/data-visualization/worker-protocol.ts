export type ChartWorkerRequest =
  | { readonly type: 'initialize'; readonly canvas: OffscreenCanvas; readonly pixelRatio: number }
  | { readonly type: 'resize'; readonly cssWidth: number; readonly cssHeight: number }
  | { readonly type: 'render'; readonly timestamps: Float64Array; readonly values: Float32Array }
  | { readonly type: 'dispose' };

export type ChartWorkerResponse =
  | { readonly type: 'ready' }
  | { readonly type: 'rendered'; readonly pointCount: number; readonly durationMs: number }
  | { readonly type: 'error'; readonly message: string };
