export function bindPushToTalk(
  target: HTMLElement,
  onStart: () => void,
  onStop: () => void,
): () => void {
  let active = false;
  const start = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || event.repeat || event.isComposing || active) return;
    event.preventDefault();
    active = true;
    onStart();
  };
  const stop = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || !active) return;
    event.preventDefault();
    active = false;
    onStop();
  };
  const cancel = () => {
    if (active) onStop();
    active = false;
  };
  target.addEventListener('keydown', start);
  target.addEventListener('keyup', stop);
  target.addEventListener('blur', cancel);
  return () => {
    cancel();
    target.removeEventListener('keydown', start);
    target.removeEventListener('keyup', stop);
    target.removeEventListener('blur', cancel);
  };
}
