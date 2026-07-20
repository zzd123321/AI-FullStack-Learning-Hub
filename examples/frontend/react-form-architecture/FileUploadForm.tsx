import { useState } from 'react'
import { uploadLessonAsset } from './lesson-service'
import { SubmitButton } from './SubmitButton'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'application/pdf'])

export function FileUploadForm() {
  const [result, setResult] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)

  async function uploadAction(formData: FormData) {
    const entry = formData.get('asset')
    if (!(entry instanceof File) || entry.size === 0) {
      setResult({ kind: 'error', message: '请选择文件。' })
      return
    }
    if (!ALLOWED_TYPES.has(entry.type) || entry.size > MAX_SIZE) {
      setResult({ kind: 'error', message: '仅支持不超过 5 MB 的 PNG、JPEG 或 PDF。' })
      return
    }
    try {
      await uploadLessonAsset(formData)
      setResult({ kind: 'success', message: '上传成功。' })
    } catch {
      setResult({ kind: 'error', message: '上传失败，请重试。' })
    }
  }

  return (
    <form action={uploadAction}>
      <label>
        课程资料
        <input name="asset" type="file" accept="image/png,image/jpeg,application/pdf" required />
      </label>
      <SubmitButton idleLabel="上传" pendingLabel="上传中……" />
      {result && (
        <p role={result.kind === 'error' ? 'alert' : 'status'}>{result.message}</p>
      )}
    </form>
  )
}
