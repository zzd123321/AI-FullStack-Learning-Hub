import { serializeForInlineScript } from './safe-serialize.js'
import type { JsonValue, PageMetadata } from './ssr-types.js'

export interface DocumentInput {
  appHtml: string
  initialState: JsonValue
  metadata: PageMetadata
  headTags?: string
  teleportHtml?: string
  clientEntryUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderDocument(input: DocumentInput): string {
  const title = escapeHtml(input.metadata.title)
  const description = escapeHtml(input.metadata.description)
  const clientEntryUrl = escapeHtml(input.clientEntryUrl)
  const state = serializeForInlineScript(input.initialState)

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${description}">
    <title>${title}</title>
    ${input.headTags ?? ''}
  </head>
  <body>
    <div id="app">${input.appHtml}</div>
    <div id="teleports">${input.teleportHtml ?? ''}</div>
    <script>window.__INITIAL_STATE__=${state}</script>
    <script type="module" src="${clientEntryUrl}"></script>
  </body>
</html>`
}
