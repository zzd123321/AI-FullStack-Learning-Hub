'use client'

import { useActionState } from 'react'
import { enrollLessonAction } from './actions.mjs'
import { SubmitButton } from './SubmitButton'
import type { EnrollmentActionState } from './types'

const initialState: EnrollmentActionState = { status: 'idle', message: null }

export function EnrollmentIsland({ lessonId }: { lessonId: string }) {
  const [state, action] = useActionState(enrollLessonAction, initialState)
  return (
    <form action={action}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <SubmitButton />
      {state.message && (
        <p role={state.status === 'success' ? 'status' : 'alert'}>{state.message}</p>
      )}
    </form>
  )
}
