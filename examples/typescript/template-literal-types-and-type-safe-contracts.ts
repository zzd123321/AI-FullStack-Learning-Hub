type ApiVersion = 'v1' | 'v2';
type Resource = 'lessons' | 'courses';
type ApiEndpoint = `/api/${ApiVersion}/${Resource}`;

type EndpointName = 'lessonList' | 'courseList' | 'nextLessonList';

// as const 保留每个路径的字面量；satisfies 检查键和值的完整契约。
const endpoints = {
  lessonList: '/api/v1/lessons',
  courseList: '/api/v1/courses',
  nextLessonList: '/api/v2/lessons',
} as const satisfies Record<EndpointName, ApiEndpoint>;

interface LessonForm {
  title: string;
  durationMinutes: number;
  published: boolean;
}

/**
 * 映射每个表单键，并把输出键改成 `${字段名}Changed`。
 * Model[Key] 让处理器参数继续对应原字段的值类型。
 */
type ChangeHandlers<Model> = {
  [Key in keyof Model as `${string & Key}Changed`]:
    (newValue: Model[Key]) => void;
};

const changeHandlers = {
  titleChanged: (title) => {
    console.log(`标题变更：${title.toUpperCase()}`);
  },
  durationMinutesChanged: (duration) => {
    console.log(`时长变更：${duration} 分钟`);
  },
  publishedChanged: (published) => {
    console.log(published ? '已发布' : '草稿');
  },
} satisfies ChangeHandlers<LessonForm>;

/** 从 `/courses/:courseId/lessons/:lessonId` 递归提取参数名。 */
type RouteParamNames<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? Param | RouteParamNames<`/${Rest}`>
    : Path extends `${string}:${infer Param}`
      ? Param
      : never;

type ParamsFor<Path extends string> = Record<RouteParamNames<Path>, string>;

function buildRoute<Path extends string>(
  template: Path,
  params: ParamsFor<Path>,
): string {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_match, key: string) => {
    /*
     * 这里是类型算法与运行时正则的衔接边界。
     * 断言成立的前提是：正则捕获的参数语法与 RouteParamNames 完全一致。
     */
    const parameterName = key as RouteParamNames<Path>;
    return encodeURIComponent(params[parameterName]);
  });
}

const routes = {
  lessonList: '/lessons',
  lessonDetail: '/courses/:courseId/lessons/:lessonId',
} as const satisfies Record<'lessonList' | 'lessonDetail', `/${string}`>;

const lessonDetailUrl = buildRoute(routes.lessonDetail, {
  courseId: 'typescript',
  lessonId: 'template-literal-types',
});

changeHandlers.titleChanged('模板字面量类型');
changeHandlers.durationMinutesChanged(150);
changeHandlers.publishedChanged(true);

console.log('API：', endpoints.lessonList);
console.log('详情页：', lessonDetailUrl);
