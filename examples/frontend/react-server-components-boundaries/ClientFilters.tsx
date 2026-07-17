'use client'

import { useState } from 'react'

export function ClientFilters({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <section>
      <button type="button" onClick={() => setExpanded((value) => !value)}>
        {expanded ? '收起筛选说明' : '展开筛选说明'}
      </button>
      {expanded && children}
    </section>
  )
}
