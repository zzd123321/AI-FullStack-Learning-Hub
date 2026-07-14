import { useEffect, useState } from 'react'
import type { EnrollmentService } from './enrollment-service'
import type { Lesson } from './types'

type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; lessons: Lesson[] }
  | { status: 'error' }

export function LessonCatalog({ service }: { service: EnrollmentService }) {
  const [retryKey, setRetryKey] = useState(0)
  const [state, setState] = useState<CatalogState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    service.listLessons(controller.signal).then(
      (lessons) => setState({ status: 'ready', lessons }),
      (error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' })
        }
      },
    )
    return () => controller.abort()
  }, [retryKey, service])

  if (state.status === 'loading') return <p role="status">正在加载课程……</p>
  if (state.status === 'error') {
    return (
      <div role="alert">
        <p>课程加载失败。</p>
        <button type="button" onClick={() => setRetryKey((key) => key + 1)}>重试</button>
      </div>
    )
  }
  if (state.lessons.length === 0) return <p>暂无课程。</p>

  return (
    <ul aria-label="课程">
      {state.lessons.map((lesson) => <li key={lesson.id}>{lesson.title}</li>)}
    </ul>
  )
}
