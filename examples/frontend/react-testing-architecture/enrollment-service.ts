import type { EnrollmentReceipt, Lesson } from './types.js'

export interface EnrollmentService {
  listLessons(signal?: AbortSignal): Promise<Lesson[]>
  getLesson(lessonId: string, signal?: AbortSignal): Promise<Lesson>
  enroll(lessonId: string, signal?: AbortSignal): Promise<EnrollmentReceipt>
}

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const fallback = response.status === 409
      ? '课程名额刚刚发生变化，请刷新后重试。'
      : '服务暂时不可用，请稍后重试。'
    throw new ServiceError(fallback, response.status)
  }
  return response.json() as Promise<T>
}

export const httpEnrollmentService: EnrollmentService = {
  async listLessons(signal) {
    return json<Lesson[]>(await fetch('/api/lessons', signal ? { signal } : {}))
  },
  async getLesson(lessonId, signal) {
    const id = encodeURIComponent(lessonId)
    return json<Lesson>(await fetch(`/api/lessons/${id}`, signal ? { signal } : {}))
  },
  async enroll(lessonId, signal) {
    const id = encodeURIComponent(lessonId)
    return json<EnrollmentReceipt>(await fetch(`/api/lessons/${id}/enrollments`, {
      method: 'POST',
      credentials: 'same-origin',
      ...(signal ? { signal } : {}),
    }))
  },
}
