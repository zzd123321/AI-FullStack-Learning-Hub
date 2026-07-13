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

  const message = error instanceof Error ? error.message : '发生未知错误'
  return (
    <main>
      <h1>页面暂时不可用</h1>
      <p role="alert">{message}</p>
      <Link to="/">返回首页</Link>
    </main>
  )
}
