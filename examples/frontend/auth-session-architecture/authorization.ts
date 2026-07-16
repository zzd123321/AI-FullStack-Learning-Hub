export interface AuthorizationContext {
  readonly permissions: ReadonlySet<string>;
  readonly attributes: Readonly<Record<string, string>>;
}

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'missing-permission' | 'attribute-mismatch' };

export function canAccess(
  context: AuthorizationContext,
  requirement: { readonly permission: string; readonly attribute?: readonly [string, string] },
): AccessDecision {
  if (!context.permissions.has(requirement.permission)) return { allowed: false, reason: 'missing-permission' };
  if (requirement.attribute && context.attributes[requirement.attribute[0]] !== requirement.attribute[1]) {
    return { allowed: false, reason: 'attribute-mismatch' };
  }
  return { allowed: true };
}
