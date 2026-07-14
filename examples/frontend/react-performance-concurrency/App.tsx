import { ConcurrentWorkspace } from './ConcurrentWorkspace'
import { PerformanceLab } from './PerformanceLab'

export function App() {
  return (
    <main>
      <h1>React 性能、并发与 Suspense</h1>
      <PerformanceLab />
      <ConcurrentWorkspace />
    </main>
  )
}
