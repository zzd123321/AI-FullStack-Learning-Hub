'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

export function InteractiveShell({
  children,
  sidebar,
}: {
  children: ReactNode
  sidebar: ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setSidebarOpen((open) => !open)}>
        {sidebarOpen ? '隐藏讲师信息' : '显示讲师信息'}
      </button>
      <main>{children}</main>
      {sidebarOpen && <aside>{sidebar}</aside>}
    </div>
  )
}
