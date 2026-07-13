import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation
} from 'react-router'
import { editLessonAction, lessonLoader } from './loaders-and-actions'

export function LessonEditPage() {
  const { lesson } = useLoaderData<typeof lessonLoader>()
  const actionData = useActionData<typeof editLessonAction>()
  const navigation = useNavigation()
  const saving = navigation.state === 'submitting'

  const title = actionData?.values.title ?? lesson.title
  const content = actionData?.values.content ?? lesson.content

  return (
    <Form method="post">
      <h2>编辑课程</h2>
      <label>
        标题
        <input name="title" defaultValue={title} aria-describedby="title-error" />
      </label>
      {actionData?.errors.title && <p id="title-error">{actionData.errors.title}</p>}

      <label>
        正文
        <textarea name="content" defaultValue={content} aria-describedby="content-error" />
      </label>
      {actionData?.errors.content && <p id="content-error">{actionData.errors.content}</p>}

      <button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
      <Link to=".." relative="path">取消</Link>
    </Form>
  )
}
