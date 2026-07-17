import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const container = document.getElementById('root')

// 与其使用非空断言，不如在运行时明确检查宿主页面契约。
if (!container) {
  throw new Error('缺少 #root 挂载节点')
}

createRoot(container).render(
  // StrictMode 只在开发阶段帮助发现不纯渲染和副作用清理问题。
  <StrictMode>
    <App />
  </StrictMode>
)
