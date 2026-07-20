export function makeDraggable(handle: HTMLElement, target: HTMLElement): () => void {
  const controller = new AbortController();
  const previousTouchAction = handle.style.touchAction;
  handle.style.touchAction = "none";
  let startX = 0;
  let originX = 0;
  let currentX = 0;
  let activePointerId: number | null = null;

  handle.addEventListener("pointerdown", (event) => {
    // 这是单指针拖拽：忽略次要触点，也不让另一种主指针抢占当前手势。
    if (event.button !== 0 || !event.isPrimary || activePointerId !== null) return;
    activePointerId = event.pointerId;
    startX = event.clientX;
    originX = currentX;
    handle.setPointerCapture(event.pointerId);
  }, { signal: controller.signal });

  handle.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId || !handle.hasPointerCapture(event.pointerId)) return;
    const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
    const latest = coalesced.at(-1) ?? event;
    currentX = originX + latest.clientX - startX;
    target.style.transform = `translateX(${currentX}px)`;
  }, { signal: controller.signal });

  const release = (event: PointerEvent) => {
    if (event.pointerId !== activePointerId) return;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    activePointerId = null;
  };
  handle.addEventListener("pointerup", release, { signal: controller.signal });
  handle.addEventListener("pointercancel", release, { signal: controller.signal });
  handle.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId === activePointerId) activePointerId = null;
  }, { signal: controller.signal });
  return () => {
    if (activePointerId !== null && handle.hasPointerCapture(activePointerId)) {
      handle.releasePointerCapture(activePointerId);
    }
    activePointerId = null;
    controller.abort();
    handle.style.touchAction = previousTouchAction;
  };
}
