export interface Lesson {
  id: string
  title: string
  summary: string
  updatedAt: string
}

export interface RequestContext {
  requestId: string
  apiOrigin: string
  sessionCookie: string | undefined
}

export interface ServerRuntimeConfig {
  /** 由部署配置提供，不能从用户可控的 Host 头推导。 */
  apiOrigin: string
  clientEntryUrl: string
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
