export type ChartWorkerRequest =
  | { readonly type: 'initialize'; readonly protocolVersion: 1; readonly canvas: OffscreenCanvas; readonly pixelRatio: number }
  | { readonly type: 'resize'; readonly revision: number; readonly cssWidth: number; readonly cssHeight: number }
  | { readonly type: 'render'; readonly revision: number; readonly timestamps: Float64Array; readonly values: Float32Array }
  | { readonly type: 'dispose' };

export type ChartWorkerResponse =
  | { readonly type: 'ready'; readonly protocolVersion: 1 }
  // 主线程只接收当前 revision，迟到的旧结果直接丢弃。
  | { readonly type: 'rendered'; readonly revision: number; readonly pointCount: number; readonly durationMs: number }
  | { readonly type: 'error'; readonly revision?: number; readonly message: string };
