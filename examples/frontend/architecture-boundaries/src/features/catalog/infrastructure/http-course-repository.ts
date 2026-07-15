import type { CourseRepository } from '../application/load-course.js';
import type { Course } from '../domain/course.js';

interface HttpCourseRepositoryOptions {
  readonly apiBaseUrl: string;
  readonly fetch: typeof globalThis.fetch;
}

function parseCourse(value: unknown): Course {
  if (typeof value !== 'object' || value === null) throw new TypeError('Invalid course response');
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.capacity !== 'number' ||
    typeof record.enrolled !== 'number' ||
    typeof record.startsAt !== 'string' ||
    !['draft', 'published', 'archived'].includes(String(record.status))
  ) {
    throw new TypeError('Invalid course response');
  }

  const startsAt = new Date(record.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new TypeError('Invalid course start time');

  return {
    id: record.id,
    title: record.title,
    capacity: record.capacity,
    enrolled: record.enrolled,
    startsAt,
    status: record.status as Course['status'],
  };
}

export class HttpCourseRepository implements CourseRepository {
  constructor(private readonly options: HttpCourseRepositoryOptions) {}

  async findById(id: string, signal?: AbortSignal): Promise<Course | undefined> {
    const response = await this.options.fetch(
      `${this.options.apiBaseUrl}/courses/${encodeURIComponent(id)}`,
      {
        headers: { accept: 'application/json' },
        ...(signal ? { signal } : {}),
      },
    );
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Course request failed: HTTP ${response.status}`);
    return parseCourse(await response.json());
  }
}
