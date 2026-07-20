import type { EnrollmentReceipt, Lesson } from './types.js'

export interface EnrollmentService {
  listLessons(signal?: AbortSignal): Promise<Lesson[]>
  getLesson(lessonId: string, signal?: AbortSignal): Promise<Lesson>
  enroll(lessonId: string, signal?: AbortSignal): Promise<EnrollmentReceipt>
}

export class ServiceError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ServiceError'
    this.status = status
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const fallback = response.status === 409
      ? '课程名额刚刚发生变化，请刷新后重试。'
      : '服务暂时不可用，请稍后重试。'
    throw new ServiceError(fallback, response.status)
  }
  return response.json()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseLesson(value: unknown): Lesson {
  if (!isRecord(value)) throw new Error('课程接口返回了无法识别的数据')
  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.seatsRemaining !== 'number' ||
    !Number.isInteger(value.seatsRemaining) ||
    value.seatsRemaining < 0 ||
    (value.requiredPlan !== 'free' && value.requiredPlan !== 'pro') ||
    typeof value.enrolled !== 'boolean'
  ) {
    throw new Error('课程接口返回了无法识别的数据')
  }
  return {
    id: value.id,
    title: value.title,
    seatsRemaining: value.seatsRemaining,
    requiredPlan: value.requiredPlan,
    enrolled: value.enrolled,
  }
}

function parseLessonList(value: unknown): Lesson[] {
  if (!Array.isArray(value)) throw new Error('课程列表接口返回了无法识别的数据')
  return value.map(parseLesson)
}

function parseReceipt(value: unknown): EnrollmentReceipt {
  if (!isRecord(value)) throw new Error('报名接口返回了无法识别的数据')
  if (
    typeof value.enrollmentId !== 'string' ||
    typeof value.lessonId !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    throw new Error('报名接口返回了无法识别的数据')
  }
  return {
    enrollmentId: value.enrollmentId,
    lessonId: value.lessonId,
    createdAt: value.createdAt,
  }
}

function apiUrl(path: string): string {
  // 浏览器使用当前 Origin；Node/jsdom 测试得到确定的同源基准。
  const origin = typeof location === 'undefined' ? 'http://localhost' : location.origin
  return new URL(path, origin).toString()
}

export const httpEnrollmentService: EnrollmentService = {
  async listLessons(signal) {
    const response = await fetch(apiUrl('/api/lessons'), signal ? { signal } : {})
    return parseLessonList(await readJson(response))
  },
  async getLesson(lessonId, signal) {
    const id = encodeURIComponent(lessonId)
    const response = await fetch(apiUrl(`/api/lessons/${id}`), signal ? { signal } : {})
    const lesson = parseLesson(await readJson(response))
    if (lesson.id !== lessonId) throw new Error('课程详情与请求 ID 不一致')
    return lesson
  },
  async enroll(lessonId, signal) {
    const id = encodeURIComponent(lessonId)
    const response = await fetch(apiUrl(`/api/lessons/${id}/enrollments`), {
      method: 'POST',
      credentials: 'same-origin',
      ...(signal ? { signal } : {}),
    })
    const receipt = parseReceipt(await readJson(response))
    if (receipt.lessonId !== lessonId) throw new Error('报名回执与请求课程不一致')
    return receipt
  },
}
