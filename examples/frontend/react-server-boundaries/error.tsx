'use client'

import { useEffect } from 'react'

export default function LessonError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('lesson route failed', error)
  }, [error])
  return (
    <main>
      <h1>课程暂时无法显示</h1>
      <button type="button" onClick={reset}>重试</button>
    </main>
  )
}
