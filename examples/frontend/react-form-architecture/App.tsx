import { ControlledProfileForm } from './ControlledProfileForm'
import { FileUploadForm } from './FileUploadForm'
import { LessonActionForm } from './LessonActionForm'
import { OptimisticTagManager } from './OptimisticTagManager'

export function App({ idempotencyKey }: { idempotencyKey: string }) {
  return (
    <main>
      <h1>React 表单架构</h1>
      <h2>React Action 课程表单</h2>
      <LessonActionForm idempotencyKey={idempotencyKey} />
      <h2>受控的即时预览表单</h2>
      <ControlledProfileForm />
      <h2>乐观标签</h2>
      <OptimisticTagManager initialTags={[{ id: 'react', name: 'React' }]} />
      <h2>文件上传</h2>
      <FileUploadForm />
    </main>
  )
}
