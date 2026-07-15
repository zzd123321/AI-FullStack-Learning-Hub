import { LoadCourse } from './application/load-course.js';
import { HttpCourseRepository } from './infrastructure/http-course-repository.js';
import { toCourseViewModel, type CourseViewModel } from './ui/course-view-model.js';

export interface CatalogFeature {
  loadCourse(id: string, signal?: AbortSignal): Promise<CourseViewModel>;
}

export interface CatalogFeatureOptions {
  readonly apiBaseUrl: string;
  readonly fetch: typeof globalThis.fetch;
  readonly locale: string;
  readonly now: () => Date;
}

export function createCatalogFeature(options: CatalogFeatureOptions): CatalogFeature {
  const repository = new HttpCourseRepository({
    apiBaseUrl: options.apiBaseUrl,
    fetch: options.fetch,
  });
  const loadCourse = new LoadCourse(repository);

  return {
    async loadCourse(id, signal) {
      const course = await loadCourse.execute(id, signal);
      return toCourseViewModel(course, options.locale, options.now());
    },
  };
}

export type { CourseViewModel } from './ui/course-view-model.js';
