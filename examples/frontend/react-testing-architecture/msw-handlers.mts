import { HttpResponse, http } from 'msw'
import { buildLesson } from './test-builders.js'

export const handlers = [
  http.get('/api/lessons', () => HttpResponse.json([
    buildLesson(),
    buildLesson({ id: 'react-router', title: 'React Router' }),
  ])),
  http.get('/api/lessons/:lessonId', ({ params }) => {
    return HttpResponse.json(buildLesson({ id: String(params.lessonId) }))
  }),
  http.post('/api/lessons/:lessonId/enrollments', ({ params }) => {
    return HttpResponse.json({
      enrollmentId: 'enrollment-msw-1',
      lessonId: String(params.lessonId),
      createdAt: '2026-07-14T00:00:00.000Z',
    }, { status: 201 })
  }),
]
