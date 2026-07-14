import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

const root = document.querySelector<HTMLDivElement>('#root')
if (!root) throw new Error('缺少 #root 挂载节点')
const idempotencyKey = crypto.randomUUID()

createRoot(root).render(
  <StrictMode>
    <App idempotencyKey={idempotencyKey} />
  </StrictMode>,
)
