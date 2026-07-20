export interface BufferSelection {
  readonly buffer: ArrayBuffer | SharedArrayBuffer;
  readonly shared: boolean;
}

export function createWorkerBuffer(byteLength: number): BufferSelection {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > 64 * 1024 * 1024) {
    throw new RangeError("byteLength must be between 0 and 64 MiB");
  }
  if (globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined") {
    return { buffer: new SharedArrayBuffer(byteLength), shared: true };
  }
  return { buffer: new ArrayBuffer(byteLength), shared: false };
}
