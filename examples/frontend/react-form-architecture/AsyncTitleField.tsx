import { useEffect, useRef, useState } from 'react'
import { checkTitleAvailability } from './lesson-service'

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'error'

export function AsyncTitleField({
  error,
  defaultValue,
}: {
  error: string | undefined
  defaultValue: string
}) {
  const controllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)
  const [availability, setAvailability] = useState<Availability>('idle')

  useEffect(() => () => controllerRef.current?.abort(), [])

  function handleChange(): void {
    // 输入一旦变化，上一标题的“可用/已占用”结论就已经失效。
    controllerRef.current?.abort()
    controllerRef.current = null
    requestIdRef.current += 1
    setAvailability('idle')
  }

  async function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    const title = event.currentTarget.value.trim()
    controllerRef.current?.abort()
    const requestId = ++requestIdRef.current
    if (title.length < 3) {
      setAvailability('idle')
      return
    }

    const controller = new AbortController()
    controllerRef.current = controller
    setAvailability('checking')
    try {
      const available = await checkTitleAvailability(title, controller.signal)
      if (requestId === requestIdRef.current) {
        setAvailability(available ? 'available' : 'taken')
      }
    } catch {
      if (
        requestId === requestIdRef.current
        && !controller.signal.aborted
      ) {
        setAvailability('error')
      }
    }
  }

  const message = {
    idle: '',
    checking: '正在检查标题……',
    available: '标题可用。',
    taken: '该标题已被使用，最终结果以提交校验为准。',
    error: '暂时无法检查，可继续提交。',
  }[availability]

  return (
    <div>
      <label htmlFor="title">标题</label>
      <input
        id="title"
        name="title"
        defaultValue={defaultValue}
        minLength={3}
        maxLength={80}
        required
        aria-invalid={Boolean(error) || availability === 'taken'}
        aria-describedby="title-help title-error title-availability"
        onChange={handleChange}
        onBlur={handleBlur}
      />
      <small id="title-help">3～80 个字符；离开输入框后检查重名。</small>
      <p id="title-error" role={error ? 'alert' : undefined}>{error}</p>
      <p id="title-availability" aria-live="polite">{message}</p>
    </div>
  )
}
