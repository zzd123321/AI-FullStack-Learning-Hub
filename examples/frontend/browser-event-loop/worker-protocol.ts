export interface PrimeRequest {
  readonly type: "find-primes";
  readonly requestId: string;
  readonly maximum: number;
}

export interface PrimeSuccess {
  readonly type: "prime-result";
  readonly requestId: string;
  readonly count: number;
  readonly largest: number | null;
}

export interface PrimeFailure {
  readonly type: "prime-error";
  readonly requestId: string;
  readonly message: string;
}

export type PrimeResponse = PrimeSuccess | PrimeFailure;

export function isPrimeRequest(value: unknown): value is PrimeRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === "find-primes" &&
    typeof record.requestId === "string" &&
    record.requestId.length > 0 &&
    record.requestId.length <= 128 &&
    typeof record.maximum === "number" &&
    Number.isSafeInteger(record.maximum) &&
    record.maximum >= 2 &&
    record.maximum <= 10_000_000
  );
}

export function isPrimeResponse(value: unknown): value is PrimeResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.requestId !== "string" ||
    record.requestId.length === 0 ||
    record.requestId.length > 128
  ) return false;
  if (record.type === "prime-error") {
    return typeof record.message === "string" && record.message.length <= 500;
  }
  return (
    record.type === "prime-result" &&
    Number.isSafeInteger(record.count) && Number(record.count) >= 0 &&
    (record.largest === null ||
      (Number.isSafeInteger(record.largest) && Number(record.largest) >= 2))
  );
}
