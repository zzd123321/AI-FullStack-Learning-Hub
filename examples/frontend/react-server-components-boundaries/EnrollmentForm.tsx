'use client'

import { useActionState, useMemo } from 'react'
import { enrollLesson } from './actions'
import { initialEnrollmentState } from './action-state'
import { SubmitButton } from './SubmitButton'

export function EnrollmentForm({
  lessonId,
  canEnroll,
  idempotencyKey,
}: {
  lessonId: string
  canEnroll: boolean
  idempotencyKey: string
}) {
  const enrollThisLesson = useMemo(() => enrollLesson.bind(null, lessonId), [lessonId])
  const [state, action, isPending] = useActionState(enrollThisLesson, initialEnrollmentState)

  return (
    <form action={action} aria-busy={isPending}>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <SubmitButton disabled={!canEnroll} />
      {state.message && (
        <p role={state.status === 'success' ? 'status' : 'alert'}>{state.message}</p>
      )}
      {state.status === 'success' && <p>报名编号：{state.receipt.enrollmentId}</p>}
    </form>
  )
}
