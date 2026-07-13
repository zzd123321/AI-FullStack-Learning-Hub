import { createPinia } from 'pinia'
import { createSSRApp, type InjectionKey } from 'vue'
import type { RouterHistory } from 'vue-router'
import App from './App.vue'
import type { LessonService } from './lesson-service'
import { createAppRouter } from './router'

export const lessonServiceKey: InjectionKey<LessonService> = Symbol('lesson-service')

export function createUniversalApp(history: RouterHistory, lessonService: LessonService) {
  // 每次调用都创建全新的 App、Router 和 Pinia，服务端必须每个请求调用一次。
  const app = createSSRApp(App)
  const pinia = createPinia()
  const router = createAppRouter(history)

  app.use(pinia)
  app.use(router)
  app.provide(lessonServiceKey, lessonService)

  return { app, pinia, router }
}
