export function observeSearchInput(
  input: HTMLInputElement,
  search: (value: string) => void,
): () => void {
  const controller = new AbortController();
  let composing = false;
  let lastSearchedValue: string | null = null;
  const commit = () => {
    if (input.value === lastSearchedValue) return;
    lastSearchedValue = input.value;
    search(input.value);
  };
  input.addEventListener("compositionstart", () => { composing = true; }, { signal: controller.signal });
  input.addEventListener("compositionend", () => {
    composing = false;
    commit();
  }, { signal: controller.signal });
  input.addEventListener("input", () => {
    if (!composing) commit();
  }, { signal: controller.signal });
  return () => controller.abort();
}
