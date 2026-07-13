import type { LessonService } from './lesson-service'
import { useWorkspaceState } from './LessonWorkspaceContext'
import { LessonEditor } from './LessonEditor'
import { LessonSidebar } from './LessonSidebar'
import { ProgressSlider } from './ProgressSlider'

interface LessonWorkspaceProps {
  service: LessonService
}

export function LessonWorkspace({ service }: LessonWorkspaceProps) {
  const { selectedId } = useWorkspaceState()

  return (
    <main>
      <h1>课程工作台</h1>
      <LessonSidebar />
      <LessonEditor service={service} />
      {selectedId && <ProgressSlider lessonId={selectedId} />}
    </main>
  )
}
