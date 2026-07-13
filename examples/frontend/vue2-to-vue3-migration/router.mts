import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./MigrationPage.vue')
    },
    {
      path: '/lessons/:id',
      name: 'lesson',
      component: () => import('./LessonDetailPage.vue'),
      props: true
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('./NotFoundPage.vue')
    }
  ],
  scrollBehavior: () => ({ left: 0, top: 0 })
})
