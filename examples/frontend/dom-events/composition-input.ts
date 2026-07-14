export function observeSearchInput(
  input: HTMLInputElement,
  search: (value: string) => void,
): () => void {
  const controller = new AbortController();
  let composing = false;
  input.addEventListener("compositionstart", () => { composing = true; }, { signal: controller.signal });
  input.addEventListener("compositionend", () => {
    composing = false;
    search(input.value);
  }, { signal: controller.signal });
  input.addEventListener("input", () => {
    if (!composing) search(input.value);
  }, { signal: controller.signal });
  return () => controller.abort();
}
