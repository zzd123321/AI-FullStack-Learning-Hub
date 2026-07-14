export function createRovingToolbar(toolbar: HTMLElement): () => void {
  const getItems = () => [...toolbar.querySelectorAll<HTMLElement>("button:not([disabled])")];
  const move = (current: HTMLElement, delta: number) => {
    const items = getItems();
    const index = items.indexOf(current);
    if (index < 0 || items.length === 0) return;
    const next = items[(index + delta + items.length) % items.length];
    items.forEach((item) => { item.tabIndex = item === next ? 0 : -1; });
    next?.focus();
  };

  const controller = new AbortController();
  toolbar.addEventListener("keydown", (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(event.target, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.target, -1);
    }
  }, { signal: controller.signal });
  return () => controller.abort();
}
