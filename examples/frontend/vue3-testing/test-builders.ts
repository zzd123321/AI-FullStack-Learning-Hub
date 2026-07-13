import type {
  LessonAccessInput,
  LessonStatus,
  UserRole
} from './lesson-policy.js'

export interface LessonFixture {
  id: string
  title: string
  status: LessonStatus
}

let fixtureSequence = 1

export function buildLesson(
  overrides: Partial<LessonFixture> = {}
): LessonFixture {
  const sequence = fixtureSequence++
  return {
    id: `lesson-${sequence}`,
    title: `Vue 测试课程 ${sequence}`,
    status: 'published',
    ...overrides
  }
}

export function buildAccessInput(
  overrides: Partial<LessonAccessInput> = {}
): LessonAccessInput {
  return {
    role: 'student' satisfies UserRole,
    status: 'published',
    enrolled: false,
    ...overrides
  }
}

export function resetFixtureSequence(): void {
  fixtureSequence = 1
}
