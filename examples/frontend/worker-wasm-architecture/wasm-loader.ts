export async function instantiateWasm(
  url: URL,
  imports: WebAssembly.Imports = {},
): Promise<WebAssembly.Instance> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Wasm fetch failed: ${response.status}`);

  const mime = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mime === 'application/wasm' && typeof WebAssembly.instantiateStreaming === 'function') {
    // With the correct MIME type, compile/link/runtime failures are genuine;
    // rethrow them instead of hiding them behind an arrayBuffer retry.
    return (await WebAssembly.instantiateStreaming(response, imports)).instance;
  }

  // Compatibility fallback for older engines or misconfigured development
  // servers. Production should still serve application/wasm.
  const bytes = await response.arrayBuffer();
  return (await WebAssembly.instantiate(bytes, imports)).instance;
}
