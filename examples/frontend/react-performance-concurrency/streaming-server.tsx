import type { ServerResponse } from 'node:http'
import { renderToPipeableStream } from 'react-dom/server'
import { App } from './App'

export function streamApp(response: ServerResponse) {
  let didError = false
  const document = (
    <html lang="zh-CN">
      <head><title>课程站</title></head>
      <body><div id="root"><App /></div></body>
    </html>
  )
  const { pipe, abort } = renderToPipeableStream(document, {
    bootstrapModules: ['/assets/hydrate-client.js'],
    onShellReady() {
      response.statusCode = didError ? 500 : 200
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      pipe(response)
    },
    onShellError(error) {
      console.error('Shell 渲染失败', error)
      response.statusCode = 500
      response.end('<!doctype html><p>页面暂时不可用</p>')
    },
    onError(error) {
      didError = true
      console.error('流式渲染错误', error)
    },
  })

  const timeout = setTimeout(abort, 10_000)
  response.on('finish', () => clearTimeout(timeout))
  response.on('close', () => {
    clearTimeout(timeout)
    abort()
  })
}
