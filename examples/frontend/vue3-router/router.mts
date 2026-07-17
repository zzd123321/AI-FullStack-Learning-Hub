import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
  type RouteRecordRaw
} from 'vue-router'
import { getSession, type Role } from './session'
import AppShell from './AppShell.vue'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    requiresAuth?: boolean
    roles?: readonly Role[]
  }
}

function firstQueryValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function positivePage(value: unknown): number {
  const page = Number(firstQueryValue(value))
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function safeRedirect(to: RouteLocationNormalized): string {
  const redirect = firstQueryValue(to.query.redirect)
  // 只接受站内绝对路径；额外拒绝反斜杠，避免不同 URL 解析器产生歧义。
  return redirect.startsWith('/') &&
    !redirect.startsWith('//') &&
    !redirect.includes('\\')
    ? redirect
    : '/'
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AppShell,
    children: [
      {
        path: '',
        redirect: { name: 'lesson-list' }
      },
      {
        path: 'lessons',
        name: 'lesson-list',
        component: () => import('./LessonListView.vue'),
        props: (route) => ({
          keyword: firstQueryValue(route.query.keyword),
          page: positivePage(route.query.page)
        }),
        meta: { title: '课程列表' }
      },
      {
        path: 'lessons/:lessonId',
        name: 'lesson-detail',
        component: () => import('./LessonDetailView.vue'),
        props: true,
        meta: { title: '课程详情' }
      },
      {
        path: 'lessons/:lessonId/edit',
        name: 'lesson-edit',
        component: () => import('./LessonEditView.vue'),
        props: true,
        meta: {
          title: '编辑课程',
          requiresAuth: true,
          roles: ['editor']
        }
      },
      {
        path: 'forbidden',
        name: 'forbidden',
        component: () => import('./ForbiddenView.vue'),
        meta: { title: '无权访问' }
      }
    ]
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('./LoginView.vue'),
    props: (route) => ({ redirect: safeRedirect(route) }),
    meta: { title: '登录' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('./NotFoundView.vue'),
    meta: { title: '页面不存在' }
  }
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  }
})

router.beforeEach((to) => {
  const session = getSession()

  if (to.meta.requiresAuth && !session.authenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
      replace: true
    }
  }

  if (
    to.meta.roles &&
    !to.meta.roles.some((role) => session.roles.includes(role))
  ) {
    return { name: 'forbidden', replace: true }
  }
})

router.afterEach((to, _from, failure) => {
  if (!failure) document.title = `${to.meta.title} · AI 全栈学习站`
})

router.onError((error) => {
  console.error('路由导航发生异常', error)
})
