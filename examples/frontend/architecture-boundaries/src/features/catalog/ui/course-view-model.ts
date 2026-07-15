import { getEnrollmentAvailability, type Course } from '../domain/course.js';

export interface CourseViewModel {
  readonly title: string;
  readonly startsAtLabel: string;
  readonly actionLabel: string;
  readonly actionDisabled: boolean;
}

export function toCourseViewModel(course: Course, locale: string, now: Date): CourseViewModel {
  const availability = getEnrollmentAvailability(course, now);
  return {
    title: course.title,
    startsAtLabel: new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(course.startsAt),
    actionLabel: availability.available ? `立即报名（剩余 ${availability.remaining}）` : '暂不可报名',
    actionDisabled: !availability.available,
  };
}
