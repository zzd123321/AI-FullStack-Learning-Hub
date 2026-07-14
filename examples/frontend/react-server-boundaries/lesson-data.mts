import 'server-only'
import { cache, cacheSignal } from 'react'
import { toLessonDTO } from './dto.js'
import { lessonRepository } from './repository.mjs'

export const getLessonForRequest = cache(async (lessonId: string) => {
  const record = await lessonRepository.findPublishedById(lessonId, cacheSignal())
  return record ? toLessonDTO(record) : null
})

export const getCommentsForRequest = cache(async (lessonId: string) => {
  return lessonRepository.listComments(lessonId)
})
