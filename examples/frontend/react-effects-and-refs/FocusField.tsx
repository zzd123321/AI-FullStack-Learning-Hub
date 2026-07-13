import { useRef } from 'react'

export function FocusField() {
  const inputRef = useRef<HTMLInputElement>(null)

  function focusInput(): void {
    inputRef.current?.focus()
  }

  return (
    <section>
      <h2>命令式 DOM Ref</h2>
      <label>
        课程标题
        <input ref={inputRef} defaultValue="React Effect" />
      </label>
      <button type="button" onClick={focusInput}>聚焦标题输入框</button>
    </section>
  )
}
