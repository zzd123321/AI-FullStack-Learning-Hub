import type { Attributes, Primitive } from './contracts.js';

const sensitiveKey = /authorization|cookie|email|password|secret|token/i;
const maximumStringLength = 300;

function sanitizePrimitive(key: string, value: unknown): Primitive | undefined {
  if (sensitiveKey.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return value.slice(0, maximumStringLength);
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  return undefined;
}

export function sanitizeAttributes(input: Readonly<Record<string, unknown>>): Attributes {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(input).flatMap(([key, value]) => {
        const sanitized = sanitizePrimitive(key, value);
        return sanitized === undefined ? [] : [[key, sanitized]];
      }),
    ),
  );
}

export function routeTemplate(url: string, origin = location.origin): string {
  try {
    const parsed = new URL(url, origin);
    return parsed.pathname
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  } catch {
    return '/unknown';
  }
}

export function errorAttributes(reason: unknown): Attributes {
  if (reason instanceof Error) {
    return sanitizeAttributes({
      errorName: reason.name,
      message: reason.message,
      stack: reason.stack,
      cause: reason.cause instanceof Error ? `${reason.cause.name}: ${reason.cause.message}` : reason.cause,
    });
  }
  return sanitizeAttributes({ errorName: 'NonErrorThrown', message: String(reason) });
}
