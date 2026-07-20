import type { ProfilerMetric } from './types.js'

const buffer: ProfilerMetric[] = []
const MAX_BUFFER_SIZE = 50

export function recordProfilerMetric(metric: ProfilerMetric): void {
  buffer.push(metric)
  if (buffer.length > MAX_BUFFER_SIZE) buffer.shift()
}

export function readProfilerMetrics(): readonly ProfilerMetric[] {
  // 不把内部可变数组引用交给调用者；即使被强制类型转换也无法篡改缓冲区。
  return buffer.slice()
}
