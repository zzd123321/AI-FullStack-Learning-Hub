import { renderPage } from './entry-server'
import { renderDocument } from './html-template'

export async function handleRequest(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url)
  const requestId = crypto.randomUUID()

  try {
    const page = await renderPage(
      `${requestUrl.pathname}${requestUrl.search}`,
      {
        requestId,
        origin: requestUrl.origin,
        cookie: request.headers.get('cookie') ?? undefined
      }
    )

    const teleportHtml = page.teleports['#teleports'] ?? ''
    const html = renderDocument({
      appHtml: page.appHtml,
      initialState: page.initialState,
      metadata: page.metadata,
      teleportHtml,
      clientEntryUrl: '/src/entry-client.mts'
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
