import { onCLS, onINP, onLCP } from 'web-vitals/attribution';

import { createVitalReporter, type MetricLike } from './performance-reporter.js';

export function installWebVitals(routeTemplate: string): void {
  const report = createVitalReporter({
    endpoint: '/api/observability/web-vitals',
    route: routeTemplate,
    sampleRate: 0.1,
  });

  const callback = (metric: MetricLike) => report(metric);
  onLCP(callback);
  onINP(callback, { includeProcessedEventEntries: false });
  onCLS(callback);
}
