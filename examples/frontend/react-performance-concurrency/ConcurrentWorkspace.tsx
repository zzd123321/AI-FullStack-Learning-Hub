import { lazy, Suspense, useState, useTransition } from 'react'
import { ErrorBoundary } from './ErrorBoundary'

type Tab = 'overview' | 'analytics'

const loadAnalytics = () => import('./HeavyAnalytics')
const HeavyAnalytics = lazy(loadAnalytics)

export function ConcurrentWorkspace() {
  const [tab, setTab] = useState<Tab>('overview')
  const [isPending, startTransition] = useTransition()

  function selectTab(nextTab: Tab) {
    startTransition(() => setTab(nextTab))
  }

  return (
    <section aria-busy={isPending}>
      <h2>Transition 与代码分割</h2>
      <div role="group" aria-label="工作区视图">
        <button
          type="button"
          aria-pressed={tab === 'overview'}
          onClick={() => selectTab('overview')}
        >
          概览
        </button>
        <button
          type="button"
          aria-pressed={tab === 'analytics'}
          onPointerEnter={loadAnalytics}
          onFocus={loadAnalytics}
          onClick={() => selectTab('analytics')}
        >
          分析
        </button>
        {isPending && <span role="status">正在切换视图……</span>}
      </div>

      <ErrorBoundary>
        <Suspense fallback={<p>正在加载分析模块……</p>}>
          {tab === 'overview'
            ? <p>概览内容会在分析模块准备好以前保持可见。</p>
            : <HeavyAnalytics />}
        </Suspense>
      </ErrorBoundary>
    </section>
  )
}
