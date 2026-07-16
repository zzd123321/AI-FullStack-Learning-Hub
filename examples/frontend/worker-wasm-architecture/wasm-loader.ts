export async function instantiateWasm(
  url: URL,
  imports: WebAssembly.Imports = {},
): Promise<WebAssembly.Instance> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Wasm fetch failed: ${response.status}`);
  try {
    return (await WebAssembly.instantiateStreaming(response.clone(), imports)).instance;
  } catch (error) {
    if (response.headers.get('Content-Type')?.includes('application/wasm')) throw error;
    const bytes = await response.arrayBuffer();
    return (await WebAssembly.instantiate(bytes, imports)).instance;
  }
}
