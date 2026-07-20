import type { TelemetryEnvelope, TelemetrySink } from './contracts.js';

export interface BatchTransportOptions {
  readonly endpoint: string;
  readonly maximumBatchSize: number;
  readonly maximumQueueSize: number;
  readonly maximumPayloadBytes: number;
  readonly flushIntervalMs: number;
  readonly fetch: typeof window.fetch;
  readonly onDrop?: (
    count: number,
    reason: 'queue-full' | 'payload-too-large' | 'send-failed',
  ) => void;
}

export function createBatchTransport(options: BatchTransportOptions): TelemetrySink & { dispose(): void } {
  if (
    !Number.isSafeInteger(options.maximumBatchSize) ||
    options.maximumBatchSize <= 0 ||
    !Number.isSafeInteger(options.maximumQueueSize) ||
    options.maximumQueueSize < options.maximumBatchSize ||
    !Number.isSafeInteger(options.maximumPayloadBytes) ||
    options.maximumPayloadBytes <= 0 ||
    !Number.isFinite(options.flushIntervalMs) ||
    options.flushIntervalMs <= 0
  ) {
    throw new RangeError('Invalid batch transport limits');
  }

  let queue: TelemetryEnvelope[] = [];
  let flushing: Promise<void> | undefined;
  const encoder = new TextEncoder();

  async function send(batch: readonly TelemetryEnvelope[], preferBeacon: boolean): Promise<void> {
    const body = JSON.stringify({ envelopes: batch });
    if (
      preferBeacon &&
      navigator.sendBeacon?.(options.endpoint, new Blob([body], { type: 'application/json' }))
    ) {
      return;
    }
    const response = await options.fetch(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      credentials: 'same-origin',
      keepalive: preferBeacon,
    });
    if (!response.ok) throw new Error(`Telemetry endpoint failed: HTTP ${response.status}`);
  }

  function takeBatch(): TelemetryEnvelope[] {
    const batch: TelemetryEnvelope[] = [];
    while (queue.length > 0 && batch.length < options.maximumBatchSize) {
      const next = queue[0]!;
      const candidate = [...batch, next];
      const bytes = encoder.encode(JSON.stringify({ envelopes: candidate })).byteLength;
      if (bytes > options.maximumPayloadBytes) {
        if (batch.length > 0) break;
        queue.shift();
        options.onDrop?.(1, 'payload-too-large');
        continue;
      }
      batch.push(next);
      queue.shift();
    }
    return batch;
  }

  async function flush(reason: Parameters<TelemetrySink['flush']>[0]): Promise<void> {
    // 如果上一批仍在发送，等待后再检查期间新进入的队列，避免 shutdown 丢掉尾批。
    if (flushing) await flushing;
    if (queue.length === 0) return;
    const drainQueue = reason === 'page-hidden' || reason === 'shutdown';
    flushing = (async () => {
      do {
        const batch = takeBatch();
        if (batch.length === 0) continue;
        await send(batch, drainQueue).catch(() => {
          // 不递归上报发送错误，通过独立计数回调观测丢弃。
          options.onDrop?.(batch.length, 'send-failed');
        });
      } while (drainQueue && queue.length > 0);
    })()
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
      if (queue.length >= options.maximumQueueSize) {
        options.onDrop?.(1, 'queue-full');
        return;
      }
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
