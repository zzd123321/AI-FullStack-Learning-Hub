export interface Course {
  readonly id: string;
  readonly title: string;
  readonly capacity: number;
  readonly enrolled: number;
  readonly startsAt: Date;
  readonly status: 'draft' | 'published' | 'archived';
}

export type EnrollmentAvailability =
  | { readonly available: true; readonly remaining: number }
  | { readonly available: false; readonly reason: 'not-published' | 'full' | 'started' };

export function getEnrollmentAvailability(course: Course, now: Date): EnrollmentAvailability {
  if (course.status !== 'published') return { available: false, reason: 'not-published' };
  if (course.enrolled >= course.capacity) return { available: false, reason: 'full' };
  if (now.getTime() >= course.startsAt.getTime()) return { available: false, reason: 'started' };
  return { available: true, remaining: course.capacity - course.enrolled };
}
