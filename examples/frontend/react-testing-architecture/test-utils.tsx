import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { ReactElement } from 'react'
import type { EnrollmentService } from './enrollment-service'

export function createService(
  overrides: Partial<EnrollmentService> = {},
): EnrollmentService {
  return {
    listLessons: vi.fn(async () => []),
    getLesson: vi.fn(async () => {
      throw new Error('测试未配置 getLesson')
    }),
    enroll: vi.fn(async () => {
      throw new Error('测试未配置 enroll')
    }),
    ...overrides,
  }
}

export function renderWithUser(ui: ReactElement) {
  return {
    user: userEvent.setup(),
    ...render(ui),
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
