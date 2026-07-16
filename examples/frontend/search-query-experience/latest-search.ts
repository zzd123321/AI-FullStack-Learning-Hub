export class LatestSearch {
  #generation = 0;
  #controller: AbortController | null = null;

  async run<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    const generation = ++this.#generation;
    this.#controller?.abort('superseded');
    const controller = new AbortController();
    this.#controller = controller;
    try {
      const result = await request(controller.signal);
      return generation === this.#generation ? result : null;
    } catch (error) {
      if (controller.signal.aborted) return null;
      throw error;
    } finally {
      if (generation === this.#generation) this.#controller = null;
    }
  }

  cancel(): void {
    this.#generation += 1;
    this.#controller?.abort('canceled');
    this.#controller = null;
  }
}
