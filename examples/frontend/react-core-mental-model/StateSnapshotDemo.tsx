import { useState } from 'react'

export function StateSnapshotDemo() {
  const [count, setCount] = useState(0)

  function addThreeFromSnapshot(): void {
    // 三次都读取本次 Render 的 count，最终只请求设置为同一个 count + 1。
    setCount(count + 1)
    setCount(count + 1)
    setCount(count + 1)
  }

  function addThreeFromQueue(): void {
    // 每个 updater 接收队列中上一步的结果，最终增加 3。
    setCount((current) => current + 1)
    setCount((current) => current + 1)
    setCount((current) => current + 1)
  }

  return (
    <section>
      <h2>State 快照与更新队列</h2>
      <output aria-live="polite">当前计数：{count}</output>
      <div>
        <button type="button" onClick={addThreeFromSnapshot}>
          用快照连续加三次
        </button>
        <button type="button" onClick={addThreeFromQueue}>
          用函数更新连续加三次
        </button>
      </div>
    </section>
  )
}
