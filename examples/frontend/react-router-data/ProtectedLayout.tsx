import { Outlet, useLoaderData } from 'react-router'
import { protectedLoader } from './loaders-and-actions'

export function ProtectedLayout() {
  const { session } = useLoaderData<typeof protectedLoader>()

  return (
    <section>
      <p>当前用户：{session.displayName}</p>
      <Outlet />
    </section>
  )
}
