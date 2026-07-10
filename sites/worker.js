/**
 * Minimal Cloudflare Worker adapter for the VitePress static build.
 * The Sites runtime provides the ASSETS binding.
 */
export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const directResponse = await env.ASSETS.fetch(request)
    if (directResponse.status !== 404) {
      return directResponse
    }

    const url = new URL(request.url)
    const hasExtension = /\/[^/]+\.[^/]+$/.test(url.pathname)

    if (!hasExtension) {
      const basePath = url.pathname.endsWith('/')
        ? url.pathname.slice(0, -1)
        : url.pathname
      const candidates = [`${basePath}.html`, `${basePath}/index.html`]

      for (const pathname of candidates) {
        const candidateUrl = new URL(pathname, url)
        const response = await env.ASSETS.fetch(
          new Request(candidateUrl, request)
        )

        if (response.status !== 404) {
          return response
        }
      }
    }

    const notFoundUrl = new URL('/404.html', url)
    return env.ASSETS.fetch(new Request(notFoundUrl, request))
  }
}
