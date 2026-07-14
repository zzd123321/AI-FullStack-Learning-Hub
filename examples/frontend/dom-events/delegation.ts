export function delegate<K extends keyof HTMLElementEventMap>(
  container: HTMLElement,
  type: K,
  selector: string,
  handler: (event: HTMLElementEventMap[K], matched: HTMLElement) => void,
  options?: AddEventListenerOptions,
): () => void {
  const listener: EventListener = (event) => {
    const matched = event.composedPath().find((node): node is HTMLElement =>
      node instanceof HTMLElement &&
      (node === container || container.contains(node)) &&
      node.matches(selector));
    if (matched) {
      handler(event as HTMLElementEventMap[K], matched);
    }
  };
  container.addEventListener(type, listener, options);
  return () => container.removeEventListener(type, listener, options);
}
