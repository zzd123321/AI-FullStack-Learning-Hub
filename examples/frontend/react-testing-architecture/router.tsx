import {
  Form,
  Outlet,
  createBrowserRouter,
  createMemoryRouter,
  isRouteErrorResponse,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
} from 'react-router'
import type { ActionFunctionArgs, LoaderFunctionArgs, RouteObject } from 'react-router'
import type { EnrollmentService } from './enrollment-service'
import type { EnrollmentReceipt, Lesson } from './types'

interface ActionData {
  receipt?: EnrollmentReceipt
  error?: string
}

function createRouteObjects(service: EnrollmentService): RouteObject[] {
  async function lessonLoader({ params, request }: LoaderFunctionArgs): Promise<Lesson> {
    if (!params.lessonId) throw new Response('Not Found', { status: 404 })
    return service.getLesson(params.lessonId, request.signal)
  }

  async function enrollmentAction({ params, request }: ActionFunctionArgs): Promise<ActionData> {
    if (!params.lessonId) throw new Response('Not Found', { status: 404 })
    try {
      const receipt = await service.enroll(params.lessonId, request.signal)
      return { receipt }
    } catch {
      return { error: '报名失败，请重试。' }
    }
  }

  return [{
    path: '/',
    Component: Outlet,
    ErrorBoundary: RouteError,
    children: [{
      path: 'lessons/:lessonId',
      loader: lessonLoader,
      action: enrollmentAction,
      Component: LessonRoute,
    }],
  }]
}

function LessonRoute() {
  const lesson = useLoaderData() as Lesson
  const actionData = useActionData() as ActionData | undefined
  const navigation = useNavigation()
  const pending = navigation.state !== 'idle'
  return (
    <main>
      <h1>{lesson.title}</h1>
      {lesson.enrolled
        ? <p>你已报名</p>
        : (
          <Form method="post">
            <button type="submit" disabled={pending}>
              {pending ? '提交中……' : '报名'}
            </button>
          </Form>
        )}
      {actionData?.receipt && <p role="status">报名成功</p>}
      {actionData?.error && <p role="alert">{actionData.error}</p>}
    </main>
  )
}

function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error) && error.status === 404
    ? '课程不存在。'
    : '页面暂时不可用。'
  return <p role="alert">{message}</p>
}

export function createAppRouter(service: EnrollmentService) {
  return createBrowserRouter(createRouteObjects(service))
}

export function createTestRouter(service: EnrollmentService, initialEntries: string[]) {
  return createMemoryRouter(createRouteObjects(service), { initialEntries })
}
