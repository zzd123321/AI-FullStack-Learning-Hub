import { Form, useActionData, useSearchParams, useNavigation } from 'react-router'
import { loginAction } from './loaders-and-actions'

export function LoginPage() {
  const actionData = useActionData<typeof loginAction>()
  const [searchParams] = useSearchParams()
  const navigation = useNavigation()
  const submitting = navigation.state === 'submitting'

  return (
    <main>
      <Form method="post">
        <h1>登录</h1>
        <input type="hidden" name="returnTo" value={searchParams.get('returnTo') ?? ''} />
        <label>邮箱 <input name="email" type="email" autoComplete="email" /></label>
        <label>密码 <input name="password" type="password" autoComplete="current-password" /></label>
        <button type="submit" disabled={submitting}>
          {submitting ? '登录中…' : '登录'}
        </button>
        {actionData?.error && <p role="alert">{actionData.error}</p>}
      </Form>
    </main>
  )
}
