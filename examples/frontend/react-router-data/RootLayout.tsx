import { NavLink, Outlet, useNavigation } from 'react-router'

export function RootLayout() {
  const navigation = useNavigation()
  const navigating = navigation.state !== 'idle'

  return (
    <>
      <header>
        <NavLink to="/">首页</NavLink>
        {' · '}
        <NavLink to="/lessons">课程</NavLink>
      </header>
      {navigating && <div role="status">页面加载中…</div>}
      <Outlet />
    </>
  )
}

export function HomePage() {
  return <main><h1>AI 全栈学习站</h1></main>
}
