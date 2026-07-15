import { expect, test as base } from '@playwright/test';

interface TestFixtures {
  readonly courseId: string;
}

export const test = base.extend<TestFixtures>({
  courseId: async ({ request }, use, testInfo) => {
    const externalId = `e2e-${testInfo.workerIndex}-${testInfo.testId}`;
    const createResponse = await request.post('/api/test-support/courses', {
      data: {
        externalId,
        title: 'TypeScript 工程边界',
        capacity: 2,
      },
    });
    expect(createResponse.ok()).toBe(true);

    const body: unknown = await createResponse.json();
    expect(body).toEqual(
      expect.objectContaining({
        courseId: expect.any(String),
      }),
    );
    const courseId = (body as { courseId: string }).courseId;
    try {
      await use(courseId);
    } finally {
      const deleteResponse = await request.delete(
        `/api/test-support/courses/${encodeURIComponent(courseId)}`,
      );
      expect(deleteResponse.ok()).toBe(true);
    }
  },
});

export { expect };
