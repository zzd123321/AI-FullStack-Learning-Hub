import { HttpResponse, http } from 'msw';

export const handlers = [
  http.post('/api/courses/:courseId/enroll', async ({ params, request }) => {
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
  }),
];
