export class WasmMemoryReader {
  constructor(
    readonly memory: WebAssembly.Memory,
    readonly maximumCopyBytes = 16 * 1024 * 1024,
  ) {
    if (!Number.isSafeInteger(maximumCopyBytes) || maximumCopyBytes < 0) {
      throw new RangeError('Invalid Wasm copy budget');
    }
  }

  copyBytes(pointer: number, length: number): Uint8Array {
    if (!Number.isSafeInteger(pointer) || pointer < 0
      || !Number.isSafeInteger(length) || length < 0) {
      throw new RangeError('Invalid Wasm pointer or length');
    }
    if (length > this.maximumCopyBytes) throw new RangeError('Wasm copy exceeds the configured budget');

    const end = pointer + length;
    const buffer = this.memory.buffer; // Re-read because memory.grow detaches old buffers.
    if (!Number.isSafeInteger(end) || end > buffer.byteLength) {
      throw new RangeError('Wasm memory range is out of bounds');
    }

    // Return a copy whose lifetime is independent of a later memory.grow().
    return new Uint8Array(buffer, pointer, length).slice();
  }
}
