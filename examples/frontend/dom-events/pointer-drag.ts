export function makeDraggable(handle: HTMLElement, target: HTMLElement): () => void {
  const controller = new AbortController();
  let startX = 0;
  let originX = 0;
  let currentX = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    startX = event.clientX;
    originX = currentX;
    handle.setPointerCapture(event.pointerId);
  }, { signal: controller.signal });

  handle.addEventListener("pointermove", (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    const latest = event.getCoalescedEvents().at(-1) ?? event;
    currentX = originX + latest.clientX - startX;
    target.style.transform = `translateX(${currentX}px)`;
  }, { signal: controller.signal });

  const release = (event: PointerEvent) => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  };
  handle.addEventListener("pointerup", release, { signal: controller.signal });
  handle.addEventListener("pointercancel", release, { signal: controller.signal });
  return () => controller.abort();
}
