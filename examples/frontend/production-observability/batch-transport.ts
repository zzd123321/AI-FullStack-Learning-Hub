import type { TelemetryEnvelope, TelemetrySink } from './contracts.js';

export interface BatchTransportOptions {
  readonly endpoint: string;
  readonly maximumBatchSize: number;
  readonly flushIntervalMs: number;
  readonly fetch: typeof window.fetch;
}

export function createBatchTransport(options: BatchTransportOptions): TelemetrySink & { dispose(): void } {
  let queue: TelemetryEnvelope[] = [];
  let flushing: Promise<void> | undefined;

  async function send(batch: readonly TelemetryEnvelope[], preferBeacon: boolean): Promise<void> {
    const body = JSON.stringify({ envelopes: batch });
    if (
      preferBeacon &&
      navigator.sendBeacon?.(options.endpoint, new Blob([body], { type: 'application/json' }))
    ) {
      return;
    }
    await options.fetch(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      credentials: 'same-origin',
      keepalive: preferBeacon,
    });
  }

  async function flush(reason: Parameters<TelemetrySink['flush']>[0]): Promise<void> {
    // 如果上一批仍在发送，等待后再检查期间新进入的队列，避免 shutdown 丢掉尾批。
    if (flushing) await flushing;
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    flushing = send(batch, reason === 'page-hidden' || reason === 'shutdown')
      .catch(() => {
        // 遥测不能阻塞业务。生产实现还应记录客户端丢弃量，并限制重试队列大小。
      })
      .finally(() => {
        flushing = undefined;
      });
    return flushing;
  }

  const timer = window.setInterval(() => void flush('interval'), options.flushIntervalMs);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') void flush('page-hidden');
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    enqueue(envelope) {
      queue.push(envelope);
      if (queue.length >= options.maximumBatchSize) void flush('batch-full');
    },
    flush,
    dispose() {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void flush('shutdown');
    },
  };
}
