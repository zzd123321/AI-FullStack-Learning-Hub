import { parseGenerationEvent, type GenerationEvent } from './generation-events.js';
import { ServerSentEventParser } from './sse-parser.js';

export async function streamGeneration(
  endpoint: string,
  prompt: string,
  requestId: string,
  signal: AbortSignal,
  onEvent: (event: GenerationEvent) => void,
): Promise<void> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
    body: JSON.stringify({ prompt, requestId }),
    signal,
  });
  if (!response.ok) throw new Error(`Generation request failed with ${response.status}`);
  if (!response.body) throw new Error('Streaming response body is unavailable');
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('text/event-stream')) {
    throw new Error('Generation endpoint did not return an SSE stream');
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new ServerSentEventParser();
  let reachedEnd = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const frame of parser.push(value)) {
        const event = parseGenerationEvent(frame.data, requestId);
        if (event) onEvent(event);
      }
    }
    parser.finish();
    reachedEnd = true;
  } finally {
    // A parser/callback failure does not imply the producer stopped. Cancel the
    // body so the browser can release the connection and apply backpressure.
    if (!reachedEnd) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
