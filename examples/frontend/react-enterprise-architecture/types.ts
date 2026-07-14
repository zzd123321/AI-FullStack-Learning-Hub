export interface RuntimeConfig {
  readonly apiBaseUrl: URL;
  readonly release: string;
  readonly environment: "development" | "staging" | "production";
}

export interface UserSession {
  readonly userId: string;
  readonly tenantId: string;
  readonly roles: readonly string[];
}

export interface LessonSummary {
  readonly id: string;
  readonly title: string;
  readonly status: "draft" | "published";
}

export interface SelectionSnapshot {
  readonly selectedId: string | null;
  readonly revision: number;
}

export interface LessonService {
  list(signal: AbortSignal): Promise<readonly LessonSummary[]>;
}

export interface Telemetry {
  event(name: string, attributes?: Readonly<Record<string, string | number | boolean>>): void;
  error(error: unknown, context?: Readonly<Record<string, string>>): void;
}
