import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Lesson } from './types'

interface LessonEditorProps {
  lesson: Lesson
  onSave: (lessonId: string, title: string) => void
}

export function LessonEditor({ lesson, onSave }: LessonEditorProps) {
  // Props 只作为初始值；之后 title 是当前编辑会话的本地草稿。
  // 父组件通过 key 在切换课程时创建新的编辑会话。
  const [title, setTitle] = useState(lesson.title)

  function updateTitle(event: ChangeEvent<HTMLInputElement>): void {
    setTitle(event.currentTarget.value)
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    // 子组件报告领域数据，而不是把 DOM Event 交给父组件。
    onSave(lesson.id, title.trim())
  }

  return (
    <form onSubmit={submit}>
      <h2>编辑：{lesson.title}</h2>
      <label>
        标题
        <input value={title} onChange={updateTitle} />
      </label>
      <button type="submit" disabled={title.trim() === ''}>
        保存
      </button>
    </form>
  )
}
