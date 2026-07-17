import type { EnrollmentReceipt } from './types.js'

export type EnrollmentActionState =
  | { status: 'idle'; message: null; fieldErrors: Record<string, never> }
  | { status: 'invalid'; message: string; fieldErrors: { idempotencyKey?: string } }
  | { status: 'error'; message: string; fieldErrors: Record<string, never> }
  | { status: 'success'; message: string; fieldErrors: Record<string, never>; receipt: EnrollmentReceipt }

export const initialEnrollmentState: EnrollmentActionState = {
  status: 'idle',
  message: null,
  fieldErrors: {},
}
