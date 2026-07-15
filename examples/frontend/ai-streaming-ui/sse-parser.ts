export interface ServerSentEvent {
  readonly event: string;
  readonly data: string;
  readonly id: string | null;
}

export class ServerSentEventParser {
  #buffer = '';
  #pendingCarriageReturn = false;

  push(chunk: string): readonly ServerSentEvent[] {
    let text = this.#pendingCarriageReturn ? `\r${chunk}` : chunk;
    this.#pendingCarriageReturn = text.endsWith('\r');
    if (this.#pendingCarriageReturn) text = text.slice(0, -1);
    this.#buffer += text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    const events: ServerSentEvent[] = [];
    let boundary = this.#buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = this.#buffer.slice(0, boundary);
      this.#buffer = this.#buffer.slice(boundary + 2);
      const parsed = parseBlock(block);
      if (parsed) events.push(parsed);
      boundary = this.#buffer.indexOf('\n\n');
    }
    return events;
  }

  finish(): void {
    if (this.#pendingCarriageReturn) {
      this.#buffer += '\n';
      this.#pendingCarriageReturn = false;
    }
    if (this.#buffer.trim() !== '') throw new Error('SSE stream ended with an incomplete event');
  }
}

function parseBlock(block: string): ServerSentEvent | null {
  let event = 'message';
  let id: string | null = null;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    const rawValue = separator < 0 ? '' : line.slice(separator + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id' && !value.includes('\0')) id = value;
  }
  return data.length === 0 ? null : { event, data: data.join('\n'), id };
}
