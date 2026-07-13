import type { Pinia } from 'pinia'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { LessonService } from './lesson-service'
import { useLessonStore } from './lesson-store'

export async function loadRouteData(
  route: RouteLocationNormalizedLoaded,
  pinia: Pinia,
  lessonService: LessonService
): Promise<void> {
  if (!route.meta.requiresLessonData) return

  const id = route.params.id
  if (typeof id !== 'string') return

  await useLessonStore(pinia).load(id, lessonService)
}
