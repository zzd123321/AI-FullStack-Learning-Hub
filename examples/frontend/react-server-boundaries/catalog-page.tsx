import { getPublishedCatalog } from './cached-catalog.mjs'

export default async function CatalogPage() {
  const lessons = await getPublishedCatalog()
  return (
    <main>
      <h1>课程目录</h1>
      <ul>
        {lessons.map((lesson) => <li key={lesson.id}>{lesson.title}</li>)}
      </ul>
    </main>
  )
}
