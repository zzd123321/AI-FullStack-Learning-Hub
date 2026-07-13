export interface Lesson {
  id: string
  title: string
  summary: string
  updatedAt: string
}

export interface RequestContext {
  requestId: string
  origin: string
  cookie?: string
}

export interface PageMetadata {
  title: string
  description: string
  status: number
}

export interface RenderedPage {
  appHtml: string
  initialState: JsonValue
  metadata: PageMetadata
  teleports: Record<string, string>
}

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[]
