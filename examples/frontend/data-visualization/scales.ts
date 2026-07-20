import type { Domain } from './types.js';

export interface LinearScale {
  (value: number): number;
  readonly domain: Domain;
  readonly range: Domain;
  invert(pixel: number): number;
  ticks(count?: number): readonly number[];
}

function assertFiniteDomain(name: string, domain: Domain): void {
  if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max)) {
    throw new TypeError(`${name} must contain finite numbers`);
  }
  if (domain.min === domain.max) {
    throw new RangeError(`${name} must have a non-zero span`);
  }
}

export function createLinearScale(domain: Domain, range: Domain): LinearScale {
  assertFiniteDomain('domain', domain);
  assertFiniteDomain('range', range);

  const domainSpan = domain.max - domain.min;
  const rangeSpan = range.max - range.min;
  const scale = ((value: number) => {
    if (!Number.isFinite(value)) throw new TypeError('scale input must be finite');
    return range.min + ((value - domain.min) / domainSpan) * rangeSpan;
  }) as LinearScale;

  Object.defineProperties(scale, {
    domain: { value: Object.freeze({ ...domain }), enumerable: true },
    range: { value: Object.freeze({ ...range }), enumerable: true },
    invert: {
      value: (pixel: number) => {
        if (!Number.isFinite(pixel)) throw new TypeError('invert input must be finite');
        return domain.min + ((pixel - range.min) / rangeSpan) * domainSpan;
      },
    },
    ticks: {
      value: (count = 5) => {
        if (!Number.isFinite(count)) throw new TypeError('tick count must be finite');
        const safeCount = Math.max(2, Math.floor(count));
        return Array.from(
          { length: safeCount },
          (_, index) => domain.min + (domainSpan * index) / (safeCount - 1),
        );
      },
    },
  });

  return scale;
}
