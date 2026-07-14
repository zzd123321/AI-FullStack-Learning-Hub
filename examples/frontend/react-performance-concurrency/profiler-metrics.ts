import type { ProfilerMetric } from './types.js'

const buffer: ProfilerMetric[] = []
const MAX_BUFFER_SIZE = 50

export function recordProfilerMetric(metric: ProfilerMetric): void {
  buffer.push(metric)
  if (buffer.length > MAX_BUFFER_SIZE) buffer.shift()
}

export function readProfilerMetrics(): readonly ProfilerMetric[] {
  return buffer
}
