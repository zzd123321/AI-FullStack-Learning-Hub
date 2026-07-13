// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

const HomeView = defineComponent({ template: '<h1>课程首页</h1>' })
const DetailView = defineComponent({
  props: { lessonId: { type: String, required: true } },
  template: '<h1>课程 {{ lessonId }}</h1>'
})
const TestApp = defineComponent({
  template: `
    <RouterLink :to="{ name: 'detail', params: { lessonId: 'vue-testing' } }">
      打开测试课程
    </RouterLink>
    <RouterView />
  `
})

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomeView },
      {
        path: '/lessons/:lessonId',
        name: 'detail',
        component: DetailView,
        props: true
      }
    ]
  })
}

describe('lesson routing', () => {
  it('navigates with a real isolated router instance', async () => {
    const router = createTestRouter()
    await router.push('/')
    await router.isReady()

    const wrapper = mount(TestApp, {
      global: { plugins: [router] }
    })

    expect(wrapper.get('h1').text()).toBe('课程首页')
    await wrapper.get('a').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/lessons/vue-testing')
    expect(wrapper.get('h1').text()).toBe('课程 vue-testing')
  })
})
