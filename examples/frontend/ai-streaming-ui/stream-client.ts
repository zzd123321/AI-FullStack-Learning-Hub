import { adaptOpenAIEvent, type GenerationEvent } from './provider-event-adapter.js';
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

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new ServerSentEventParser();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const frame of parser.push(value)) {
        const event = adaptOpenAIEvent(frame.data, requestId);
        if (event) onEvent(event);
      }
    }
    parser.finish();
  } finally {
    reader.releaseLock();
  }
}
