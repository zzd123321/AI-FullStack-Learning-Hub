import { ChatRoom } from './ChatRoom'
import { FocusField } from './FocusField'
import { LessonSearchPage } from './LessonSearchPage'
import { PointerTracker } from './PointerTracker'
import { createMockConnection } from './chat-service'
import { createLessonGateway } from './lesson-gateway'

const gateway = createLessonGateway()

export default function App() {
  return (
    <main>
      <h1>React Effect、Ref 与异步边界</h1>
      <LessonSearchPage gateway={gateway} />
      <ChatRoom createConnection={createMockConnection} />
      <PointerTracker />
      <FocusField />
    </main>
  )
}
