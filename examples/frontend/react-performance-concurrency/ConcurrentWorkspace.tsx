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
      <div role="tablist" aria-label="工作区">
        <button
          role="tab"
          aria-selected={tab === 'overview'}
          onClick={() => selectTab('overview')}
        >
          概览
        </button>
        <button
          role="tab"
          aria-selected={tab === 'analytics'}
          onPointerEnter={loadAnalytics}
          onFocus={loadAnalytics}
          onClick={() => selectTab('analytics')}
        >
          {isPending ? '分析（加载中）' : '分析'}
        </button>
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
