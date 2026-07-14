export function installPageListeners(root: HTMLElement): AbortController {
  const controller = new AbortController();
  const { signal } = controller;

  root.addEventListener("click", () => root.classList.toggle("active"), { signal });
  window.addEventListener("resize", () => root.style.setProperty("--vw", `${innerWidth}px`), {
    signal,
    passive: true,
  });
  document.addEventListener("visibilitychange", () => {
    root.toggleAttribute("data-hidden", document.hidden);
  }, { signal });

  return controller;
}
