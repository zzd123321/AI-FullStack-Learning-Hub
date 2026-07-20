import { LoadCourse } from './application/load-course.js';
import { HttpCourseRepository } from './infrastructure/http-course-repository.js';
import { toCourseViewModel, type CourseViewModel } from './ui/course-view-model.js';

export interface CatalogFeature {
  loadCourse(id: string, signal?: AbortSignal): Promise<CourseViewModel>;
}

export interface CatalogFeatureOptions {
  readonly apiBaseUrl: URL;
  readonly fetch: typeof globalThis.fetch;
  readonly locale: string;
  readonly now: () => Date;
}

function copyApiBaseUrl(value: URL): URL {
  if (value.protocol !== 'http:' && value.protocol !== 'https:') {
    throw new TypeError('API base URL must use HTTP or HTTPS');
  }
  if (!value.pathname.endsWith('/')) {
    throw new TypeError('API base URL pathname must end with "/"');
  }
  // URL 对象可变；Feature 保存副本，避免调用方之后修改同一个实例。
  return new URL(value.href);
}

export function createCatalogFeature(options: CatalogFeatureOptions): CatalogFeature {
  const repository = new HttpCourseRepository({
    apiBaseUrl: copyApiBaseUrl(options.apiBaseUrl),
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
