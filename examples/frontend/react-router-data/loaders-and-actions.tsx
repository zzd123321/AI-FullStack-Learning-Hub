import {
  data,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs
} from 'react-router'
import { getSession, login } from './auth-service'
import { getLesson, listLessons, publishLesson, updateLesson } from './lesson-service'
import { parseLessonQuery, safeReturnTo, validateLessonForm } from './route-contracts'
import type { LessonActionData } from './types'

function requiredParam(params: LoaderFunctionArgs['params'], name: string): string {
  const value = params[name]
  if (!value) throw new Response(`缺少参数：${name}`, { status: 400 })
  return value
}

export async function protectedLoader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.signal)
  if (!session) {
    const url = new URL(request.url)
    const returnTo = `${url.pathname}${url.search}`
    throw redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
  }
  return { session }
}

export async function lessonsLoader({ request }: LoaderFunctionArgs) {
  const query = parseLessonQuery(new URL(request.url))
  const lessons = await listLessons(query, request.signal)
  return { lessons, query }
}

export async function lessonLoader({ request, params }: LoaderFunctionArgs) {
  const lessonId = requiredParam(params, 'lessonId')
  const lesson = await getLesson(lessonId, request.signal)
  return { lesson }
}

export async function lessonAction({ request, params }: ActionFunctionArgs) {
  const lessonId = requiredParam(params, 'lessonId')
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')

  if (intent !== 'publish') {
    throw new Response('未知操作', { status: 400 })
  }

  await publishLesson(lessonId, request.signal)
  return { ok: true }
}

export async function editLessonAction({ request, params }: ActionFunctionArgs) {
  const lessonId = requiredParam(params, 'lessonId')
  const result = validateLessonForm(await request.formData())

  if (!result.ok) return data<LessonActionData>(result, { status: 400 })

  await updateLesson(lessonId, result.values, request.signal)
  return redirect(`/lessons/${encodeURIComponent(lessonId)}`)
}

export async function loginAction({ request }: ActionFunctionArgs) {
  const formData = await request.formData()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const returnTo = safeReturnTo(formData.get('returnTo'))

  if (!email || !password) {
    return data({ error: '请输入邮箱和密码' }, { status: 400 })
  }

  try {
    await login(email, password, request.signal)
    return redirect(returnTo)
  } catch (cause: unknown) {
    return data({
      error: cause instanceof Error ? cause.message : '登录失败'
    }, { status: 401 })
  }
}
