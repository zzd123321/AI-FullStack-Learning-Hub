import type {
  Attributes,
  ReleaseContext,
  RuntimeContext,
  Telemetry,
  TelemetryEnvelope,
  TelemetrySignal,
  TelemetrySink,
} from './contracts.js';
import { errorAttributes, sanitizeAttributes } from './sanitize.js';

function randomHex(bytes: number): string {
  const value = [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  // W3C Trace Context 不允许全零 Trace ID 和 Parent ID。
  return /^0+$/.test(value) ? randomHex(bytes) : value;
}

export interface TelemetryOptions {
  readonly release: ReleaseContext;
  readonly runtime: () => RuntimeContext;
  readonly sink: TelemetrySink;
  readonly sample: (signal: TelemetrySignal) => boolean;
  readonly now?: () => number;
}

export function createTelemetry(options: TelemetryOptions): Telemetry {
  const now = options.now ?? Date.now;

  function emit(
    signal: TelemetrySignal,
    name: string,
    attributes: Readonly<Record<string, unknown>> = {},
    extra: Partial<Pick<TelemetryEnvelope, 'traceId' | 'spanId' | 'durationMs'>> = {},
    sampledOverride?: boolean,
  ): void {
    if (!(sampledOverride ?? options.sample(signal))) return;
    options.sink.enqueue({
      schemaVersion: 1,
      id: crypto.randomUUID(),
      signal,
      name,
      timestamp: new Date(now()).toISOString(),
      release: options.release,
      runtime: options.runtime(),
      attributes: sanitizeAttributes(attributes),
      ...extra,
    });
  }

  return {
    event: (name, attributes = {}) => emit('event', name, attributes),
    metric: (name, value, attributes = {}) => emit('metric', name, { ...attributes, value }),
    error: (reason, attributes = {}) =>
      emit('error', 'uncaught.error', { ...attributes, ...errorAttributes(reason) }),
    startSpan(name, attributes: Attributes = {}) {
      const sampled = options.sample('span');
      const traceId = randomHex(16);
      const spanId = randomHex(8);
      const startedAt = performance.now();
      let ended = false;
      const finish = (status: 'ok' | 'error', finalAttributes: Readonly<Record<string, unknown>>) => {
        if (ended) return;
        ended = true;
        emit('span', name, { ...attributes, ...finalAttributes, status }, {
          traceId,
          spanId,
          durationMs: performance.now() - startedAt,
        }, sampled);
      };
      return {
        traceId,
        spanId,
        sampled,
        end: (finalAttributes = {}) => finish('ok', finalAttributes),
        fail: (reason, finalAttributes = {}) =>
          finish('error', { ...finalAttributes, ...errorAttributes(reason) }),
      };
    },
  };
}
