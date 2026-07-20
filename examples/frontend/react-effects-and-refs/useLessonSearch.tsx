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
    // 每次 Effect 都有自己的 ignore。Cleanup 只会收回这一轮请求的写权限。
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
      // ignore 保证旧 Promise 即使继续完成，也不能更新新页面。
      ignore = true
      // abort 尽量停止仍在进行的网络与解析工作，减少资源浪费。
      controller.abort()
    }
  }, [gateway, keyword, reloadToken])

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1)
  }, [])

  return { state, reload }
}
