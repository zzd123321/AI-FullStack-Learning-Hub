export interface EnrollmentContext {
  readonly capacity: number;
  readonly enrolled: boolean;
  readonly opensAt: number;
  readonly closesAt: number;
  readonly now: number;
}

export type EnrollmentDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: 'already-enrolled' | 'full' | 'not-open' | 'closed';
    };

export function evaluateEnrollment(context: EnrollmentContext): EnrollmentDecision {
  if (context.enrolled) return { allowed: false, reason: 'already-enrolled' };
  if (context.capacity <= 0) return { allowed: false, reason: 'full' };
  if (context.now < context.opensAt) return { allowed: false, reason: 'not-open' };
  if (context.now >= context.closesAt) return { allowed: false, reason: 'closed' };
  return { allowed: true };
}
