import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { toLessonDTO } from './dto.js'
import { lessonRepository } from './repository.mjs'

export async function getPublishedCatalog() {
  'use cache'
  cacheLife('hours')
  cacheTag('published-lessons')
  const records = await lessonRepository.listPublished()
  return records.map(toLessonDTO)
}
