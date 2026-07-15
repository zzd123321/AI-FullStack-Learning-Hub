import type { Telemetry } from './contracts.js';

export function installGlobalErrorCapture(telemetry: Telemetry): () => void {
  const onError = (event: ErrorEvent) => {
    telemetry.error(event.error ?? new Error(event.message), {
      mechanism: 'window.error',
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  };

  const onResourceError = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const url =
      target instanceof HTMLScriptElement || target instanceof HTMLImageElement
        ? target.src
        : target instanceof HTMLLinkElement
          ? target.href
          : '';
    telemetry.event('resource.load_failed', {
      tag: target.tagName.toLowerCase(),
      path: url ? new URL(url, location.href).pathname : 'unknown',
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    telemetry.error(event.reason, { mechanism: 'window.unhandledrejection' });
  };

  window.addEventListener('error', onError);
  // 资源加载失败不会冒泡，必须在捕获阶段监听。
  window.addEventListener('error', onResourceError, true);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('error', onResourceError, true);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
