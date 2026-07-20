import type { CourseRepository } from '../application/load-course.js';
import type { Course } from '../domain/course.js';

interface HttpCourseRepositoryOptions {
  readonly apiBaseUrl: URL;
  readonly fetch: typeof globalThis.fetch;
}

function isCourseStatus(value: unknown): value is Course['status'] {
  return value === 'draft' || value === 'published' || value === 'archived';
}

function parseCourse(value: unknown): Course {
  if (typeof value !== 'object' || value === null) throw new TypeError('Invalid course response');
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    record.id.trim() === '' ||
    typeof record.title !== 'string' ||
    record.title.trim() === '' ||
    typeof record.capacity !== 'number' ||
    !Number.isSafeInteger(record.capacity) ||
    record.capacity < 0 ||
    typeof record.enrolled !== 'number' ||
    !Number.isSafeInteger(record.enrolled) ||
    record.enrolled < 0 ||
    typeof record.startsAt !== 'string' ||
    !isCourseStatus(record.status)
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
    status: record.status,
  };
}

export class HttpCourseRepository implements CourseRepository {
  constructor(private readonly options: HttpCourseRepositoryOptions) {}

  async findById(id: string, signal?: AbortSignal): Promise<Course | undefined> {
    const response = await this.options.fetch(
      new URL(`courses/${encodeURIComponent(id)}`, this.options.apiBaseUrl),
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
