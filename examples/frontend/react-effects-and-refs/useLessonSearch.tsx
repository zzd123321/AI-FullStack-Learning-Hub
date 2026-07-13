import { useCallback, useEffect, useState } from 'react'
import type { AsyncState, LessonGateway, LessonSummary } from './types'

export function useLessonSearch(keyword: string, gateway: LessonGateway) {
  const [state, setState] = useState<AsyncState<readonly LessonSummary[]>>({
    status: 'idle'
  })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const normalizedKeyword = keyword.trim()

    if (normalizedKeyword === '') {
      setState({ status: 'idle' })
      return
    }

    const controller = new AbortController()
    let ignore = false
    setState({ status: 'loading' })

    void gateway.search(normalizedKeyword, controller.signal).then(
      (data) => {
        if (!ignore) setState({ status: 'success', data })
      },
      (cause: unknown) => {
        if (ignore || controller.signal.aborted) return
        const message = cause instanceof Error ? cause.message : '搜索失败'
        setState({ status: 'error', message })
      }
    )

    return () => {
      ignore = true
      controller.abort()
    }
  }, [gateway, keyword, reloadToken])

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1)
  }, [])

  return { state, reload }
}
