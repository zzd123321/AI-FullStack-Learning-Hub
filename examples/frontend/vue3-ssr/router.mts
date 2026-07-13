import {
  createRouter,
  type RouteRecordRaw,
  type RouterHistory
} from 'vue-router'
import HomeView from './HomeView.vue'
import LessonView from './LessonView.vue'
import NotFoundView from './NotFoundView.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  {
    path: '/lessons/:id',
    name: 'lesson',
    component: LessonView,
    meta: { requiresLessonData: true }
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView }
]

export function createAppRouter(history: RouterHistory) {
  return createRouter({ history, routes })
}
