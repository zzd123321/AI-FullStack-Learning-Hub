export interface LessonSummary {
  readonly id: string;
  readonly title: string;
}

function isLessonSummary(value: unknown): value is LessonSummary {
  // 网络响应不受 TypeScript 控制，必须在进入业务层前验证结构。
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.title === 'string';
}

export async function loadLesson(id: string, signal?: AbortSignal): Promise<LessonSummary> {
  // encodeURIComponent 防止课程 ID 改变路径结构；signal 让调用方能取消过期请求。
  const response = await fetch(`/api/lessons/${encodeURIComponent(id)}`, {
    ...(signal ? { signal } : {}),
  });
  // fetch 遇到 404/500 不会自动 reject，需要应用显式解释 HTTP 语义。
  if (!response.ok) throw new Error(`Lesson request failed: HTTP ${response.status}`);

  const value: unknown = await response.json();
  if (!isLessonSummary(value)) throw new TypeError('Invalid lesson response');
  return value;
}
