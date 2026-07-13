import { useState } from 'react'
import type { LessonGateway } from './types'
import { useLessonSearch } from './useLessonSearch'

interface LessonSearchPageProps {
  gateway: LessonGateway
}

export function LessonSearchPage({ gateway }: LessonSearchPageProps) {
  const [keyword, setKeyword] = useState('React')
  const { state, reload } = useLessonSearch(keyword, gateway)

  return (
    <section>
      <h2>课程搜索</h2>
      <label>
        关键词
        <input
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.currentTarget.value)}
        />
      </label>

      {state.status === 'idle' && <p>请输入关键词。</p>}
      {state.status === 'loading' && <p aria-live="polite">加载中…</p>}
      {state.status === 'error' && (
        <div role="alert">
          <p>{state.message}</p>
          <button type="button" onClick={reload}>重试</button>
        </div>
      )}
      {state.status === 'success' && (
        state.data.length === 0 ? <p>没有匹配课程。</p> : (
          <ul>
            {state.data.map((lesson) => (
              <li key={lesson.id}>
                <strong>{lesson.title}</strong>
                <p>{lesson.summary}</p>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  )
}
