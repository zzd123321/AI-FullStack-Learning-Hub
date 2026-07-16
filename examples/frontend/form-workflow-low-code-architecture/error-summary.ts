export interface FieldError {
  readonly fieldId: string;
  readonly code: string;
  readonly message: string;
}

export interface ErrorSummaryItem extends FieldError {
  readonly controlId: string;
  readonly errorId: string;
}

export function buildErrorSummary(errors: readonly FieldError[]): readonly ErrorSummaryItem[] {
  return errors.map((error) => {
    if (!/^[a-z][a-zA-Z0-9_]{0,79}$/.test(error.fieldId)) {
      throw new TypeError('Unsafe field ID');
    }
    return { ...error, controlId: `field-${error.fieldId}`, errorId: `error-${error.fieldId}` };
  });
}
