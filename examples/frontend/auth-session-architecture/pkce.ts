const base64Url = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export interface PkcePair { readonly verifier: string; readonly challenge: string }

/** Generate an opaque value that is safe to place in an OAuth query parameter. */
export function randomBase64Url(byteLength = 32): string {
  if (!Number.isSafeInteger(byteLength) || byteLength < 16 || byteLength > 96) {
    throw new RangeError('byteLength must be an integer between 16 and 96');
  }
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function createPkcePair(): Promise<PkcePair> {
  // 32 random bytes become a 43-character verifier after Base64URL encoding.
  // A new verifier must be generated for every authorization transaction.
  const verifier = randomBase64Url();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}
