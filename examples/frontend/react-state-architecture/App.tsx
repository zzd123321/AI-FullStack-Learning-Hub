import { LessonWorkspace } from './LessonWorkspace'
import { LessonWorkspaceProvider } from './LessonWorkspaceContext'
import { ProgressProvider } from './ProgressContext'
import { createLessonService } from './lesson-service'
import type { Lesson } from './types'

const initialLessons: readonly Lesson[] = [
  { id: 'react-state', title: 'React 状态架构', status: 'draft' },
  { id: 'react-effects', title: 'React Effect 边界', status: 'published' }
]

const lessonService = createLessonService()

export default function App() {
  return (
    <LessonWorkspaceProvider initialLessons={initialLessons}>
      <ProgressProvider initialProgress={{ 'react-effects': 60 }}>
        <LessonWorkspace service={lessonService} />
      </ProgressProvider>
    </LessonWorkspaceProvider>
  )
}
