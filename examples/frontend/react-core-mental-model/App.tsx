import { LessonCatalog } from './LessonCatalog'
import { StateSnapshotDemo } from './StateSnapshotDemo'
import { lessons } from './lesson-data'

export default function App() {
  return (
    <main>
      {/* 两个功能彼此独立，各自拥有自己的交互状态。 */}
      <LessonCatalog initialLessons={lessons} />
      <StateSnapshotDemo />
    </main>
  )
}
