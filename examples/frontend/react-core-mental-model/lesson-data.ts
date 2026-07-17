import type { Lesson, LessonFilters } from './types.js'

export const lessons: readonly Lesson[] = [
  { id: 'ts-types', title: 'TypeScript 类型设计', level: 'intermediate', published: true },
  { id: 'vue-reactivity', title: 'Vue 3 响应式原理', level: 'advanced', published: true },
  { id: 'react-state', title: 'React State 心智模型', level: 'intermediate', published: true },
  { id: 'browser-render', title: '浏览器渲染流水线', level: 'advanced', published: false }
]

export function filterLessons(
  source: readonly Lesson[],
  filters: LessonFilters
): readonly Lesson[] {
  // 先统一搜索格式，使下面的过滤条件只关心业务判断。
  const keyword = filters.keyword.trim().toLocaleLowerCase()

  return source.filter((lesson) => {
    if (filters.publishedOnly && !lesson.published) return false
    return keyword === '' || lesson.title.toLocaleLowerCase().includes(keyword)
  })
}
