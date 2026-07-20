import { HttpResponse, http } from 'msw';

export const handlers = [
  // Node fetch 要求绝对 URL；测试 origin 明确后，也不会误拦截别的服务。
  http.post(
    'http://learning.test/api/courses/:courseId/enroll',
    async ({ params, request }) => {
      const body: unknown = await request.json();
      const idempotencyKey = request.headers.get('idempotency-key');

      if (
        typeof body !== 'object' ||
        body === null ||
        (body as Record<string, unknown>).courseId !== params.courseId ||
        !idempotencyKey
      ) {
        return HttpResponse.json({ message: 'Invalid enrollment request' }, { status: 400 });
      }

      return HttpResponse.json(
        {
          enrollmentId: `enrollment-${idempotencyKey}`,
          courseId: params.courseId,
          status: 'confirmed',
        },
        { status: 201 },
      );
    },
  ),
];
