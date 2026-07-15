export type Primitive = string | number | boolean;
export type Attributes = Readonly<Record<string, Primitive>>;

export interface ReleaseContext {
  readonly service: string;
  readonly environment: 'development' | 'staging' | 'production';
  readonly release: string;
  readonly buildTime: string;
  readonly commit: string;
}

export interface RuntimeContext {
  readonly sessionId: string;
  readonly route: string;
  readonly locale: string;
  readonly userCohort?: string;
}

export type TelemetrySignal = 'error' | 'event' | 'log' | 'metric' | 'span';

export interface TelemetryEnvelope {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly signal: TelemetrySignal;
  readonly name: string;
  readonly timestamp: string;
  readonly release: ReleaseContext;
  readonly runtime: RuntimeContext;
  readonly attributes: Attributes;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly durationMs?: number;
}

export interface TelemetrySink {
  enqueue(envelope: TelemetryEnvelope): void;
  flush(reason: 'batch-full' | 'interval' | 'page-hidden' | 'shutdown'): Promise<void>;
}

export interface Telemetry {
  event(name: string, attributes?: Attributes): void;
  metric(name: string, value: number, attributes?: Attributes): void;
  error(reason: unknown, attributes?: Attributes): void;
  startSpan(name: string, attributes?: Attributes): Span;
}

export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly sampled: boolean;
  end(attributes?: Attributes): void;
  fail(reason: unknown, attributes?: Attributes): void;
}
