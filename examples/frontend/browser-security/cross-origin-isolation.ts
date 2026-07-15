export interface BufferSelection {
  readonly buffer: ArrayBuffer | SharedArrayBuffer;
  readonly shared: boolean;
}

export function createWorkerBuffer(byteLength: number): BufferSelection {
  if (globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined") {
    return { buffer: new SharedArrayBuffer(byteLength), shared: true };
  }
  return { buffer: new ArrayBuffer(byteLength), shared: false };
}
