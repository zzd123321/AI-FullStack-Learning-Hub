import { createBatchTransport } from './batch-transport.js';
import type { ReleaseContext } from './contracts.js';
import { createObservableFlagReader } from './feature-flags.js';
import { installGlobalErrorCapture } from './global-errors.js';
import { createInstrumentedFetch } from './instrumented-fetch.js';
import { createSampler } from './sampling.js';
import { routeTemplate } from './sanitize.js';
import { createTelemetry } from './telemetry.js';

declare const __RELEASE__: ReleaseContext;

export function bootstrapProductionRuntime(sessionId: string, targetingKey: string) {
  const transport = createBatchTransport({
    endpoint: '/api/telemetry/batch',
    maximumBatchSize: 20,
    flushIntervalMs: 10_000,
    fetch: window.fetch.bind(window),
  });
  const telemetry = createTelemetry({
    release: __RELEASE__,
    runtime: () => ({
      sessionId,
      route: routeTemplate(location.href),
      locale: navigator.language,
    }),
    sink: transport,
    sample: createSampler(sessionId, { sessionRate: 0.1, keepAllErrors: true }),
  });
  const removeGlobalCapture = installGlobalErrorCapture(telemetry);
  const instrumentedFetch = createInstrumentedFetch(
    telemetry,
    new Set([location.origin, 'https://api.example.com']),
  );
  const readFlag = createObservableFlagReader(
    telemetry,
    { targetingKey },
    {
      'new-checkout': { key: 'new-checkout', enabled: true, rollout: 0.05 },
    },
  );

  telemetry.event('application.started');
  return {
    telemetry,
    fetch: instrumentedFetch,
    flags: { newCheckout: readFlag('new-checkout', false) },
    dispose() {
      removeGlobalCapture();
      transport.dispose();
    },
  };
}
