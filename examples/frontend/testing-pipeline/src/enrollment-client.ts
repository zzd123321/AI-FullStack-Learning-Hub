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
  signal?: AbortSignal,
): Promise<EnrollmentReceipt> {
  const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/enroll`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({ courseId }),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new EnrollmentApiError(response.status, await readErrorMessage(response));
  }

  return parseReceipt(await response.json());
}
