import type { Lesson, Session } from './types.js'

export function buildLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'react-testing',
    title: 'React 测试策略',
    seatsRemaining: 3,
    requiredPlan: 'free',
    enrolled: false,
    ...overrides,
  }
}

export function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    authenticated: true,
    plan: 'free',
    ...overrides,
  }
}
