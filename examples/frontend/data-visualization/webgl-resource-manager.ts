export class WebGLResourceManager {
  readonly #buffers = new Set<WebGLBuffer>();
  #lost = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly gl: WebGL2RenderingContext,
    readonly restoreScene: () => void,
  ) {
    canvas.addEventListener('webglcontextlost', this.#onContextLost);
    canvas.addEventListener('webglcontextrestored', this.#onContextRestored);
  }

  createBuffer(data: BufferSource, usage = this.gl.STATIC_DRAW): WebGLBuffer {
    if (this.#lost) throw new Error('WebGL context is lost');
    const buffer = this.gl.createBuffer();
    if (!buffer) throw new Error('Unable to allocate a WebGL buffer');
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, usage);
    this.#buffers.add(buffer);
    return buffer;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.#onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.#onContextRestored);
    for (const buffer of this.#buffers) this.gl.deleteBuffer(buffer);
    this.#buffers.clear();
  }

  readonly #onContextLost = (event: Event): void => {
    event.preventDefault();
    this.#lost = true;
    this.#buffers.clear();
  };

  readonly #onContextRestored = (): void => {
    this.#lost = false;
    this.restoreScene();
  };
}
