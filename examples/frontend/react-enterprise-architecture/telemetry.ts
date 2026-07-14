import type { Telemetry } from "./types.js";

export interface TelemetryEnvelope {
  readonly type: "event" | "error";
  readonly name: string;
  readonly release: string;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

export function createTelemetry(
  release: string,
  send: (envelope: TelemetryEnvelope) => void,
): Telemetry {
  return {
    event(name, attributes = {}) {
      send({ type: "event", name, release, attributes });
    },
    error(error, context = {}) {
      const name = error instanceof Error ? error.name : "UnknownError";
      send({ type: "error", name, release, attributes: context });
    },
  };
}
