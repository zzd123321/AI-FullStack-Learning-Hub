import { renderToString, type SSRContext } from 'vue/server-renderer'
import { createMemoryHistory } from 'vue-router'
import { createUniversalApp } from './app'
import { createServerLessonService } from './lesson-service'
import { useLessonStore } from './lesson-store'
import { loadRouteData } from './route-data'
import type { JsonValue, RenderedPage, RequestContext } from './ssr-types'

export async function renderPage(
  url: string,
  requestContext: RequestContext
): Promise<RenderedPage> {
  const lessonService = createServerLessonService(requestContext)
  const { app, pinia, router } = createUniversalApp(
    createMemoryHistory(),
    lessonService
  )

  await router.push(url)
  await router.isReady()
  await loadRouteData(router.currentRoute.value, pinia, lessonService)

  const ssrContext: SSRContext = {}
  const appHtml = await renderToString(app, ssrContext)
  const route = router.currentRoute.value
  const lesson = useLessonStore(pinia).current
  const notFound = route.name === 'not-found' ||
    (route.name === 'lesson' && lesson === null)

  return {
    appHtml,
    // 必须在服务端渲染完成后读取，因为 onServerPrefetch 也可能写入状态。
    initialState: pinia.state.value as unknown as JsonValue,
    metadata: {
      title: lesson?.title ?? (notFound ? '页面不存在' : 'AI 全栈学习站'),
      description: lesson?.summary ?? '系统学习现代前端与全栈工程',
      status: notFound ? 404 : 200
    },
    teleports: ssrContext.teleports ?? {}
  }
}
