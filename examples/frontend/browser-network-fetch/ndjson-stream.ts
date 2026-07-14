export async function* parseNdjsonStream<T>(
  response: Response,
  parse: (value: unknown) => T,
  maximumLineBytes = 1_000_000,
): AsyncGenerator<T> {
  if (!response.ok) throw new Error(`Stream failed with HTTP ${response.status}`);
  if (!response.body) throw new Error("ReadableStream is unavailable");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          if (new TextEncoder().encode(line).byteLength > maximumLineBytes) {
            throw new Error("NDJSON line exceeds the configured limit");
          }
          yield parse(JSON.parse(line) as unknown);
        }
        newline = buffer.indexOf("\n");
      }
      if (new TextEncoder().encode(buffer).byteLength > maximumLineBytes) {
        throw new Error("NDJSON line exceeds the configured limit");
      }
      if (done) break;
    }

    const finalLine = buffer.trim();
    if (finalLine) yield parse(JSON.parse(finalLine) as unknown);
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
