export interface LessonSummary {
  id: string
  title: string
  category: 'TypeScript' | 'Vue' | 'React' | 'Browser'
  durationMinutes: number
  popularity: number
}

export interface ProfilerMetric {
  id: string
  phase: 'mount' | 'update' | 'nested-update'
  actualDuration: number
  baseDuration: number
  startTime: number
  commitTime: number
}
