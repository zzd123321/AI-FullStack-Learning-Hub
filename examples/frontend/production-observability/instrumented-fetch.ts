import type { Attributes, Telemetry } from './contracts.js';
import { routeTemplate } from './sanitize.js';

function traceparent(traceId: string, spanId: string, sampled: boolean): string {
  return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`;
}

export function createInstrumentedFetch(
  telemetry: Telemetry,
  allowedTraceOrigins: ReadonlySet<string>,
  baseFetch: typeof window.fetch = window.fetch.bind(window),
): typeof window.fetch {
  return async (input, init = {}) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const span = telemetry.startSpan('http.client', {
      method: request.method,
      route: routeTemplate(url.href),
      origin: url.origin,
    });
    const headers = new Headers(request.headers);
    if (allowedTraceOrigins.has(url.origin)) {
      headers.set('traceparent', traceparent(span.traceId, span.spanId, span.sampled));
    }

    try {
      const response = await baseFetch(new Request(request, { headers }));
      const attributes: Attributes = {
        status: response.status,
        ok: response.ok,
      };
      if (response.ok) span.end(attributes);
      else span.fail(new Error(`HTTP ${response.status}`), attributes);
      return response;
    } catch (error) {
      span.fail(error, { networkError: true });
      throw error;
    }
  };
}
