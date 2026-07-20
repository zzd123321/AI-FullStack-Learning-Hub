import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

export function RouteErrorBoundary() {
  const error = useRouteError()

  if (isRouteErrorResponse(error)) {
    return (
      <main>
        <h1>{error.status === 404 ? '资源不存在' : '请求失败'}</h1>
        <p>{error.status} {error.statusText}</p>
        <Link to="/lessons">返回课程列表</Link>
      </main>
    )
  }

  // 未预期异常应进入监控；不要把内部错误详情直接展示给最终用户。
  console.error('route error', error)
  return (
    <main>
      <h1>页面暂时不可用</h1>
      <p role="alert">请稍后重试，或返回首页。</p>
      <Link to="/">返回首页</Link>
    </main>
  )
}
