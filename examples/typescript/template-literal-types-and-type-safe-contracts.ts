export {}

type ApiVersion = 'v1' | 'v2'
type Resource = 'lessons' | 'courses'
type ApiEndpoint = `/api/${ApiVersion}/${Resource}`

const endpoints = {
  lessonList: '/api/v1/lessons',
  courseList: '/api/v1/courses',
  nextLessonList: '/api/v2/lessons'
} as const satisfies Record<string, ApiEndpoint>

type RouteParamNames<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? Param | RouteParamNames<`/${Rest}`>
    : Path extends `${string}:${infer Param}`
      ? Param
      : never

type ParamsFor<Path extends string> = Record<
  RouteParamNames<Path>,
  string
>

function buildRoute<Path extends string>(
  template: Path,
  params: ParamsFor<Path>
): string {
  return template.replace(
    /:([A-Za-z0-9_]+)/g,
    (_match, key: string) =>
      encodeURIComponent(
        params[key as RouteParamNames<Path>]
      )
  )
}

const routes = {
  lessonList: '/lessons',
  lessonDetail: '/courses/:courseId/lessons/:lessonId'
} as const satisfies Record<
  'lessonList' | 'lessonDetail',
  `/${string}`
>

const lessonDetailUrl = buildRoute(routes.lessonDetail, {
  courseId: 'typescript',
  lessonId: 'template-literal-types'
})

interface LessonForm {
  title: string
  durationMinutes: number
  published: boolean
}

type ChangeHandlers<Type> = {
  [Key in keyof Type as
    `${string & Key}Changed`
  ]: (newValue: Type[Key]) => void
}

const changeHandlers = {
  titleChanged: title => {
    console.log(`标题变更：${title.toUpperCase()}`)
  },
  durationMinutesChanged: duration => {
    console.log(`时长变更：${duration} 分钟`)
  },
  publishedChanged: published => {
    console.log(published ? '已发布' : '草稿')
  }
} satisfies ChangeHandlers<LessonForm>

type LessonEventName =
  | 'lesson.created'
  | 'lesson.published'

interface EventMetadata {
  durable: boolean
  description: string
}

const eventMetadata = {
  'lesson.created': {
    durable: true,
    description: '课程创建完成'
  },
  'lesson.published': {
    durable: true,
    description: '课程正式发布'
  }
} as const satisfies Record<LessonEventName, EventMetadata>

type Locale = 'zh-CN' | 'en-US'
type MessageName = 'lesson.title' | 'lesson.description'
type LocalizedMessageKey = `${Locale}.${MessageName}`

const messages = {
  'zh-CN.lesson.title': '课程标题',
  'zh-CN.lesson.description': '课程说明',
  'en-US.lesson.title': 'Lesson title',
  'en-US.lesson.description': 'Lesson description'
} as const satisfies Record<LocalizedMessageKey, string>

changeHandlers.titleChanged('模板字面量类型')
changeHandlers.durationMinutesChanged(150)
changeHandlers.publishedChanged(true)

console.log('API：', endpoints.lessonList)
console.log('详情页：', lessonDetailUrl)
console.log('事件：', eventMetadata['lesson.created'].description)
console.log('文案：', messages['zh-CN.lesson.title'])
