import { createWebHistory } from 'vue-router'
import type { StateTree } from 'pinia'
import { createUniversalApp } from './app'
import { createBrowserLessonService } from './lesson-service'
import { loadRouteData } from './route-data'

declare global {
  interface Window {
    __INITIAL_STATE__?: StateTree
  }
}

const lessonService = createBrowserLessonService()
const { app, pinia, router } = createUniversalApp(
  createWebHistory(),
  lessonService
)

// 在任何 Store 被组件读取前恢复服务端状态，避免首屏重复请求与 DOM 不一致。
if (window.__INITIAL_STATE__) {
  pinia.state.value = window.__INITIAL_STATE__
  delete window.__INITIAL_STATE__
}

await router.isReady()

// 后续纯客户端导航仍需加载路由数据；首屏因 loadedId 已恢复而会去重。
router.beforeResolve(async (to) => {
  await loadRouteData(to, pinia, lessonService)
})

app.mount('#app')
