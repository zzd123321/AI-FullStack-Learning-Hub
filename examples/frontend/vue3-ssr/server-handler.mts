import { renderPage } from './entry-server'
import { renderDocument } from './html-template'
import type { ServerRuntimeConfig } from './ssr-types'

function pickSessionCookie(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined

  // 示例应用只允许向内部 API 转发这一枚会话 Cookie。
  const session = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('__Host-session='))

  return session || undefined
}

export async function handleRequest(
  request: Request,
  config: ServerRuntimeConfig
): Promise<Response> {
  const requestUrl = new URL(request.url)
  const requestId = crypto.randomUUID()

  try {
    const page = await renderPage(
      `${requestUrl.pathname}${requestUrl.search}`,
      {
        requestId,
        // API Origin 来自可信部署配置，不能使用 requestUrl.origin 或 Host。
        apiOrigin: config.apiOrigin,
        sessionCookie: pickSessionCookie(request.headers.get('cookie'))
      }
    )

    const teleportHtml = page.teleports['#teleports'] ?? ''
    const html = renderDocument({
      appHtml: page.appHtml,
      initialState: page.initialState,
      metadata: page.metadata,
      teleportHtml,
      clientEntryUrl: config.clientEntryUrl
    })

    return new Response(html, {
      status: page.metadata.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'x-request-id': requestId,
        // 含用户 Cookie 的页面绝不能进入共享缓存。
        'cache-control': request.headers.has('cookie')
          ? 'private, no-store'
          : 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
      }
    })
  } catch (error: unknown) {
    console.error({ requestId, error })
    return new Response('服务器暂时不可用', {
      status: 500,
      headers: { 'x-request-id': requestId }
    })
  }
}
