export interface Money {
  readonly currency: string;
  readonly minor: bigint;
  readonly fractionDigits: number;
}

export function parseDecimalMoney(
  input: string,
  currency: string,
  fractionDigits: number,
): Money {
  if (input.length > 64) throw new RangeError('Amount is too long');
  if (!/^[A-Za-z]{3}$/.test(currency)) throw new TypeError('Invalid currency code');
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 6) {
    throw new RangeError('Unsupported currency precision');
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(input);
  if (!match) throw new TypeError('Invalid non-negative decimal amount');
  const fraction = match[2] ?? '';
  if (fraction.length > fractionDigits) throw new RangeError('Too many fraction digits');
  const scale = 10n ** BigInt(fractionDigits);
  const minor = BigInt(match[1]!) * scale + BigInt(fraction.padEnd(fractionDigits, '0') || '0');
  return { currency: currency.toUpperCase(), minor, fractionDigits };
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency || left.fractionDigits !== right.fractionDigits) {
    throw new TypeError('Currency mismatch');
  }
  return { ...left, minor: left.minor + right.minor };
}
