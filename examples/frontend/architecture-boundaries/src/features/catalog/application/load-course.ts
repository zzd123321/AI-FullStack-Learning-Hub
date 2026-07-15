import type { Course } from '../domain/course.js';

export interface CourseRepository {
  findById(id: string, signal?: AbortSignal): Promise<Course | undefined>;
}

export class CourseNotFoundError extends Error {
  constructor(readonly courseId: string) {
    super(`Course not found: ${courseId}`);
    this.name = 'CourseNotFoundError';
  }
}

export class LoadCourse {
  constructor(private readonly repository: CourseRepository) {}

  async execute(id: string, signal?: AbortSignal): Promise<Course> {
    const normalizedId = id.trim();
    if (!normalizedId) throw new TypeError('Course id is required');

    const course = await this.repository.findById(normalizedId, signal);
    if (!course) throw new CourseNotFoundError(normalizedId);
    return course;
  }
}
