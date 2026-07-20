export function createRovingToolbar(toolbar: HTMLElement): () => void {
  const getItems = () => [...toolbar.querySelectorAll<HTMLElement>("button:not([disabled])")];
  const focusAt = (items: readonly HTMLElement[], index: number) => {
    const next = items[index];
    if (!next) return;
    items.forEach((item) => { item.tabIndex = item === next ? 0 : -1; });
    next.focus();
  };
  const move = (current: HTMLElement, delta: number) => {
    const items = getItems();
    const index = items.indexOf(current);
    if (index < 0 || items.length === 0) return;
    focusAt(items, (index + delta + items.length) % items.length);
  };

  const controller = new AbortController();
  const initialItems = getItems();
  const initialCurrent = initialItems.findIndex((item) => item.tabIndex === 0);
  if (initialItems.length > 0) {
    initialItems.forEach((item, index) => {
      item.tabIndex = index === Math.max(0, initialCurrent) ? 0 : -1;
    });
  }

  toolbar.addEventListener("keydown", (event) => {
    const current = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("button") : null;
    if (!current || !toolbar.contains(current)) return;
    const vertical = toolbar.getAttribute("aria-orientation") === "vertical";
    const forwardKey = vertical ? "ArrowDown" : "ArrowRight";
    const backwardKey = vertical ? "ArrowUp" : "ArrowLeft";

    if (event.key === forwardKey) {
      event.preventDefault();
      move(current, 1);
    } else if (event.key === backwardKey) {
      event.preventDefault();
      move(current, -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const items = getItems();
      focusAt(items, event.key === "Home" ? 0 : items.length - 1);
    }
  }, { signal: controller.signal });
  return () => controller.abort();
}
