import type { EnrollmentCommand } from './types.js'

export type ParseCommandResult =
  | { ok: true; command: EnrollmentCommand }
  | { ok: false; fieldErrors: { idempotencyKey?: string } }

export function parseEnrollmentCommand(
  formData: FormData,
  trustedLessonId: string,
): ParseCommandResult {
  const idempotencyKey = formData.get('idempotencyKey')

  if (trustedLessonId.length === 0) {
    return { ok: false, fieldErrors: {} }
  }
  if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9-]{16,128}$/.test(idempotencyKey)) {
    return { ok: false, fieldErrors: { idempotencyKey: '提交令牌无效，请刷新页面。' } }
  }
  return { ok: true, command: { lessonId: trustedLessonId, idempotencyKey } }
}
