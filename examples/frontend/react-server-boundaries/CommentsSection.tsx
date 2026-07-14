import { Suspense } from 'react'
import { Comments } from './Comments'
import { getCommentsForRequest } from './lesson-data.mjs'

export function CommentsSection({ lessonId }: { lessonId: string }) {
  const commentsPromise = getCommentsForRequest(lessonId)
  return (
    <Suspense fallback={<p>正在加载评论……</p>}>
      <Comments commentsPromise={commentsPromise} />
    </Suspense>
  )
}
