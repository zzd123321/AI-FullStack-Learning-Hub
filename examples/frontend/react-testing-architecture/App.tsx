import { RouterProvider } from 'react-router/dom'
import { httpEnrollmentService } from './enrollment-service'
import { createAppRouter } from './router'

const router = createAppRouter(httpEnrollmentService)

export function App() {
  return <RouterProvider router={router} />
}
