import { LessonCatalog } from './LessonCatalog'
import { StateSnapshotDemo } from './StateSnapshotDemo'
import { lessons } from './lesson-data'

export default function App() {
  return (
    <main>
      <LessonCatalog initialLessons={lessons} />
      <StateSnapshotDemo />
    </main>
  )
}
