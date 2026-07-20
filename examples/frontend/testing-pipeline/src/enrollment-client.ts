export interface EnrollmentReceipt {
  readonly enrollmentId: string;
  readonly courseId: string;
  readonly status: 'confirmed';
}

export class EnrollmentApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'EnrollmentApiError';
  }
}

export interface EnrollmentRequestOptions {
  /**
   * 使用应用配置解析出的绝对 API 基址，例如 `https://example.com/api/`。
   * 显式注入后，浏览器、Node 测试和 SSR 不必各自猜测当前 origin。
   */
  readonly apiBaseUrl: string;
  readonly signal?: AbortSignal;
}

function parseApiBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('API base URL must use HTTP or HTTPS');
  }
  if (!url.pathname.endsWith('/')) {
    throw new TypeError('API base URL pathname must end with "/"');
  }
  return url;
}

function parseReceipt(value: unknown): EnrollmentReceipt {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Invalid enrollment response');
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.enrollmentId !== 'string' ||
    typeof record.courseId !== 'string' ||
    record.status !== 'confirmed'
  ) {
    throw new TypeError('Invalid enrollment response');
  }

  return {
    enrollmentId: record.enrollmentId,
    courseId: record.courseId,
    status: record.status,
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  const value: unknown = await response.json().catch(() => null);
  if (typeof value === 'object' && value !== null) {
    const message = (value as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
  }
  return `Enrollment failed: HTTP ${response.status}`;
}

export async function enrollInCourse(
  courseId: string,
  idempotencyKey: string,
  options: EnrollmentRequestOptions,
): Promise<EnrollmentReceipt> {
  const endpoint = new URL(
    `courses/${encodeURIComponent(courseId)}/enroll`,
    parseApiBaseUrl(options.apiBaseUrl),
  );

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({ courseId }),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    throw new EnrollmentApiError(response.status, await readErrorMessage(response));
  }

  return parseReceipt(await response.json());
}
