import type { LessonDTO, LessonRecord } from './types.js'

export function toLessonDTO(record: LessonRecord): LessonDTO {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    summary: record.summary,
    seatsRemaining: record.seatsRemaining,
  }
}
