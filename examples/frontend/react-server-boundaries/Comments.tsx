'use client'

import { use } from 'react'
import type { CommentDTO } from './types'

export function Comments({ commentsPromise }: { commentsPromise: Promise<CommentDTO[]> }) {
  const comments = use(commentsPromise)
  return (
    <ul aria-label="评论">
      {comments.map((comment) => (
        <li key={comment.id}><strong>{comment.authorName}</strong>：{comment.body}</li>
      ))}
    </ul>
  )
}
