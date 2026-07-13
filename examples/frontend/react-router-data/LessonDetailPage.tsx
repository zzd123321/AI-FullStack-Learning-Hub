import { Form, Link, useFetcher, useLoaderData } from 'react-router'
import { lessonAction, lessonLoader } from './loaders-and-actions'

export function LessonDetailPage() {
  const { lesson } = useLoaderData<typeof lessonLoader>()
  const fetcher = useFetcher<typeof lessonAction>()
  const publishing = fetcher.state !== 'idle'

  return (
    <article>
      <h2>{lesson.title}</h2>
      <p>{lesson.content}</p>
      <p>状态：{lesson.status}</p>
      <Link to="edit">编辑</Link>

      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="publish" />
        <button type="submit" disabled={publishing || lesson.status === 'published'}>
          {publishing ? '发布中…' : '发布'}
        </button>
      </fetcher.Form>
      {fetcher.data?.ok && <p role="status">发布成功</p>}
    </article>
  )
}

export function NotFoundPage() {
  return (
    <main>
      <h1>页面不存在</h1>
      <Link to="/">返回首页</Link>
    </main>
  )
}
