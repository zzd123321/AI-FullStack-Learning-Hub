import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('延迟模块渲染失败', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return <p role="alert">模块加载失败，请刷新后重试。</p>
    }
    return this.props.children
  }
}
