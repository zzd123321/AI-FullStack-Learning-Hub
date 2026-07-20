export class StreamingScrollController {
  #followOutput = true;

  constructor(readonly container: HTMLElement, readonly threshold = 48) {
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new RangeError('threshold must be a non-negative number');
    }
  }

  onUserScroll(): void {
    const distance = this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight;
    this.#followOutput = distance <= this.threshold;
  }

  onContentCommitted(): void {
    // Assigning scrollTop avoids starting a new smooth-scroll animation for
    // every streamed batch. CSS should not force smooth behavior here.
    if (this.#followOutput) this.container.scrollTop = this.container.scrollHeight;
  }

  get isFollowingOutput(): boolean {
    return this.#followOutput;
  }

  resume(): void {
    this.#followOutput = true;
    this.onContentCommitted();
  }
}
