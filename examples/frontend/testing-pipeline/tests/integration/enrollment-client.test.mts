import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  enrollInCourse,
} from '../../src/enrollment-client.js';
import { server } from '../mocks/server.mjs';

describe('enrollInCourse', () => {
  it('maps a successful HTTP response into a trusted receipt', async () => {
    await expect(enrollInCourse('ts-boundaries', 'request-17')).resolves.toEqual({
      enrollmentId: 'enrollment-request-17',
      courseId: 'ts-boundaries',
      status: 'confirmed',
    });
  });

  it('maps a conflict response into a domain-facing API error', async () => {
    server.use(
      http.post('/api/courses/:courseId/enroll', () =>
        HttpResponse.json({ message: 'Already enrolled' }, { status: 409 }),
      ),
    );

    const promise = enrollInCourse('ts-boundaries', 'duplicate-17');

    await expect(promise).rejects.toMatchObject({
      name: 'EnrollmentApiError',
      status: 409,
      message: 'Already enrolled',
    });
  });

  it('rejects a successful response that violates the runtime contract', async () => {
    server.use(
      http.post('/api/courses/:courseId/enroll', () =>
        HttpResponse.json({ enrollment_id: 17 }, { status: 201 }),
      ),
    );

    await expect(enrollInCourse('ts-boundaries', 'invalid-17')).rejects.toThrow(
      'Invalid enrollment response',
    );
  });
});
