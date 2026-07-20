export interface CurrencySpec {
  readonly currency: string;
  readonly fractionDigits: number;
  /** A product limit, expressed in the currency's smallest unit. */
  readonly maximumMinor: bigint;
}

export interface Money {
  readonly currency: string;
  readonly minor: bigint;
  readonly fractionDigits: number;
}

function validateSpec(spec: CurrencySpec): void {
  if (!/^[A-Z]{3}$/.test(spec.currency)) throw new TypeError('Invalid currency code');
  if (!Number.isInteger(spec.fractionDigits) || spec.fractionDigits < 0 || spec.fractionDigits > 6) {
    throw new RangeError('Unsupported currency precision');
  }
  if (spec.maximumMinor < 0n || spec.maximumMinor >= 10n ** 30n) {
    throw new RangeError('Invalid amount limit');
  }
}

export function parseDecimalMoney(input: string, spec: CurrencySpec): Money {
  validateSpec(spec);
  if (input.length > 64) throw new RangeError('Amount is too long');

  // Checkout amounts are non-negative. Credits and ledger entries should use
  // a separate signed domain type instead of smuggling a minus sign in here.
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(input);
  if (!match) throw new TypeError('Invalid non-negative decimal amount');
  const fraction = match[2] ?? '';
  if (fraction.length > spec.fractionDigits) throw new RangeError('Too many fraction digits');

  const scale = 10n ** BigInt(spec.fractionDigits);
  const minor = BigInt(match[1] as string) * scale
    + BigInt(fraction.padEnd(spec.fractionDigits, '0') || '0');
  if (minor > spec.maximumMinor) throw new RangeError('Amount exceeds the product limit');
  return { currency: spec.currency, minor, fractionDigits: spec.fractionDigits };
}

export function addMoney(left: Money, right: Money, maximumMinor: bigint): Money {
  if (left.currency !== right.currency || left.fractionDigits !== right.fractionDigits) {
    throw new TypeError('Currency mismatch');
  }
  if (left.minor < 0n || right.minor < 0n || maximumMinor < 0n) {
    throw new RangeError('Checkout money must be non-negative');
  }
  const minor = left.minor + right.minor;
  if (minor > maximumMinor) throw new RangeError('Amount exceeds the product limit');
  return { ...left, minor };
}

/** JSON has no bigint representation; serialize minor units as decimal digits. */
export function moneyToJson(money: Money): { readonly currency: string; readonly minor: string } {
  if (money.minor < 0n) throw new RangeError('Checkout money must be non-negative');
  return { currency: money.currency, minor: money.minor.toString() };
}
