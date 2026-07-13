import { Form, NavLink, Outlet, useLoaderData, useNavigation } from 'react-router'
import { lessonsLoader } from './loaders-and-actions'

export function LessonsLayout() {
  const { lessons, query } = useLoaderData<typeof lessonsLoader>()
  const navigation = useNavigation()
  const searching = navigation.state === 'loading' &&
    new URLSearchParams(navigation.location?.search).has('keyword')

  return (
    <main>
      <h1>课程</h1>
      <Form method="get" role="search">
        <label>
          关键词
          <input name="keyword" defaultValue={query.keyword} type="search" />
        </label>
        <label>
          状态
          <select name="status" defaultValue={query.status}>
            <option value="all">全部</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
          </select>
        </label>
        <button type="submit">筛选</button>
        {searching && <span role="status">筛选中…</span>}
      </Form>

      <div className="lesson-workspace">
        <nav aria-label="课程列表">
          {lessons.length === 0 ? <p>没有匹配课程。</p> : (
            <ul>
              {lessons.map((lesson) => (
                <li key={lesson.id}>
                  <NavLink to={lesson.id}>{lesson.title}</NavLink>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <Outlet />
      </div>
    </main>
  )
}

export function LessonIndexPage() {
  return <p>请选择一门课程。</p>
}
