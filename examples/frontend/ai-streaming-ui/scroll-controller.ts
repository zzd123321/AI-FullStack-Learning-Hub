export class StreamingScrollController {
  #followOutput = true;

  constructor(readonly container: HTMLElement, readonly threshold = 48) {}

  onUserScroll(): void {
    const distance = this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight;
    this.#followOutput = distance <= this.threshold;
  }

  onContentCommitted(): void {
    if (this.#followOutput) this.container.scrollTop = this.container.scrollHeight;
  }

  resume(): void {
    this.#followOutput = true;
    this.onContentCommitted();
  }
}
