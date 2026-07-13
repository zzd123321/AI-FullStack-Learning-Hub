export interface LessonSummary {
  id: string
  title: string
  level: 'beginner' | 'intermediate' | 'advanced'
}

export interface LessonSearchQuery {
  keyword: string
  page: number
  pageSize: number
}

export interface LessonSearchResult {
  items: LessonSummary[]
  total: number
}

export interface LessonGateway {
  search(query: LessonSearchQuery, signal: AbortSignal): Promise<LessonSearchResult>
}

export interface MigrationEvents {
  'lesson:selected': { lessonId: string; source: 'search' | 'recommendation' }
  'session:expired': { returnTo: string }
}
