import { useActionState, useEffect, useMemo, useRef } from 'react'
import { AsyncTitleField } from './AsyncTitleField'
import { createInitialFormState, saveLessonAction } from './lesson-action'
import { SubmitButton } from './SubmitButton'

export function LessonActionForm({ idempotencyKey }: { idempotencyKey: string }) {
  const initialState = useMemo(
    () => createInitialFormState(idempotencyKey),
    [idempotencyKey],
  )
  const [state, formAction, isPending] = useActionState(saveLessonAction, initialState)
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (state.status === 'invalid' || state.status === 'error') {
      summaryRef.current?.focus()
    }
  }, [state])

  return (
    <form key={state.revision} action={formAction} aria-busy={isPending}>
      {state.message && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role={state.status === 'success' ? 'status' : 'alert'}
        >
          {state.message}
        </div>
      )}

      <AsyncTitleField error={state.errors.title} defaultValue={state.values?.title ?? ''} />

      <div>
        <label htmlFor="summary">简介</label>
        <textarea
          id="summary"
          name="summary"
          defaultValue={state.values?.summary ?? ''}
          minLength={20}
          maxLength={500}
          required
          aria-invalid={Boolean(state.errors.summary)}
          aria-describedby="summary-error"
        />
        <p id="summary-error">{state.errors.summary}</p>
      </div>

      <div>
        <label htmlFor="level">难度</label>
        <select
          id="level"
          name="level"
          defaultValue={state.values?.level ?? ''}
          required
          aria-invalid={Boolean(state.errors.level)}
          aria-describedby="level-error"
        >
          <option value="" disabled>请选择</option>
          <option value="beginner">入门</option>
          <option value="intermediate">进阶</option>
          <option value="advanced">高级</option>
        </select>
        <p id="level-error">{state.errors.level}</p>
      </div>

      <fieldset aria-describedby="tags-error">
        <legend>标签</legend>
        <label>
          <input
            type="checkbox"
            name="tags"
            value="react"
            defaultChecked={state.values?.tags.includes('react') ?? false}
          /> React
        </label>
        <label>
          <input
            type="checkbox"
            name="tags"
            value="typescript"
            defaultChecked={state.values?.tags.includes('typescript') ?? false}
          /> TypeScript
        </label>
        <label>
          <input
            type="checkbox"
            name="tags"
            value="architecture"
            defaultChecked={state.values?.tags.includes('architecture') ?? false}
          /> 架构
        </label>
      </fieldset>
      <p id="tags-error">{state.errors.tags}</p>

      <label>
        <input
          type="checkbox"
          name="featured"
          defaultChecked={state.values?.featured ?? false}
        /> 设为精选课程
      </label>

      <SubmitButton />
    </form>
  )
}
