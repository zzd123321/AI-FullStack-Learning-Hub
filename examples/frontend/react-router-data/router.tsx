import { createBrowserRouter } from 'react-router'
import { LessonDetailPage, NotFoundPage } from './LessonDetailPage'
import { LessonEditPage } from './LessonEditPage'
import { LessonIndexPage, LessonsLayout } from './LessonsLayout'
import { LoginPage } from './LoginPage'
import { ProtectedLayout } from './ProtectedLayout'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { HomePage, RootLayout } from './RootLayout'
import {
  editLessonAction,
  lessonAction,
  lessonLoader,
  lessonsLoader,
  loginAction,
  protectedLoader
} from './loaders-and-actions'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      { index: true, Component: HomePage },
      { path: 'login', Component: LoginPage, action: loginAction },
      {
        loader: protectedLoader,
        Component: ProtectedLayout,
        children: [
          {
            path: 'lessons',
            loader: lessonsLoader,
            Component: LessonsLayout,
            children: [
              { index: true, Component: LessonIndexPage },
              {
                path: ':lessonId',
                loader: lessonLoader,
                action: lessonAction,
                Component: LessonDetailPage
              },
              {
                path: ':lessonId/edit',
                loader: lessonLoader,
                action: editLessonAction,
                Component: LessonEditPage
              }
            ]
          }
        ]
      },
      { path: '*', Component: NotFoundPage }
    ]
  }
])
