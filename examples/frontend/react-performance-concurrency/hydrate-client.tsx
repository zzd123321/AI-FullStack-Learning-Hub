import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { App } from './App'

const container = document.querySelector<HTMLDivElement>('#root')
if (!container) throw new Error('缺少服务端渲染的 #root 节点')

hydrateRoot(
  container,
  <StrictMode>
    <App />
  </StrictMode>,
  {
    onRecoverableError(error, errorInfo) {
      console.error('Hydration 可恢复错误', error, errorInfo.componentStack)
    },
  },
)
