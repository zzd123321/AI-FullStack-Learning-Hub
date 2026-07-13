import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Lesson } from './types'
import { Button } from './Button'

interface LessonEditorProps {
  lesson: Lesson
  onSave: (lessonId: string, title: string) => void
}

export function LessonEditor({ lesson, onSave }: LessonEditorProps) {
  const [title, setTitle] = useState(lesson.title)

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    onSave(lesson.id, title.trim())
  }

  return (
    <form onSubmit={submit}>
      <h2>编辑：{lesson.title}</h2>
      <label>
        标题
        <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
      </label>
      <Button type="submit" tone="primary" disabled={title.trim() === ''}>
        保存
      </Button>
    </form>
  )
}
