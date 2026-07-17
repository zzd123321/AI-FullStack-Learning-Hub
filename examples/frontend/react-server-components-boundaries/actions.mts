'use server'

import type { EnrollmentActionState } from './action-state.js'
import { getServerRuntime } from './server/runtime'
import { parseEnrollmentCommand } from './validation.js'

export async function enrollLesson(
  trustedLessonId: string,
  _previousState: EnrollmentActionState,
  formData: FormData,
): Promise<EnrollmentActionState> {
  const parsed = parseEnrollmentCommand(formData, trustedLessonId)
  if (!parsed.ok) {
    return {
      status: 'invalid' as const,
      message: '提交数据无效。',
      fieldErrors: parsed.fieldErrors,
    }
  }

  const runtime = getServerRuntime()
  const user = await runtime.currentUser()
  if (!user) {
    return { status: 'error' as const, message: '登录状态已失效。', fieldErrors: {} }
  }

  try {
    // The repository must re-check permissions, capacity, and idempotency in a transaction.
    const receipt = await runtime.enroll(user.id, parsed.command)
    runtime.revalidateLesson(receipt.lessonId)
    return {
      status: 'success' as const,
      message: '报名成功。',
      fieldErrors: {},
      receipt,
    }
  } catch {
    return { status: 'error' as const, message: '报名失败，请刷新后重试。', fieldErrors: {} }
  }
}
