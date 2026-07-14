'use server'

import { updateTag } from 'next/cache'
import { parseEnrollmentForm } from './action-contract.js'
import { EnrollmentCommandError, enrollLesson } from './enrollment-command.mjs'
import type { EnrollmentActionState } from './types.js'

export async function enrollLessonAction(
  _previousState: EnrollmentActionState,
  formData: FormData,
): Promise<EnrollmentActionState> {
  const parsed = parseEnrollmentForm(formData)
  if (!parsed.ok) return { status: 'invalid', message: parsed.message }

  try {
    const result = await enrollLesson(parsed)
    updateTag('published-lessons')
    return {
      status: 'success',
      message: result.duplicate ? '该请求已处理。' : '报名成功。',
    }
  } catch (error) {
    if (error instanceof EnrollmentCommandError) {
      const message = {
        unauthenticated: '请重新登录后报名。',
        'not-found': '课程不存在或不可报名。',
        'sold-out': '课程名额已满。',
      }[error.code]
      return { status: 'error', message }
    }
    console.error('enrollLessonAction failed', error)
    return { status: 'error', message: '服务暂时不可用，请稍后重试。' }
  }
}
