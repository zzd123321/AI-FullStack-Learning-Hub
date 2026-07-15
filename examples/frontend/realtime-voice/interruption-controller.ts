export interface RealtimeEventSender {
  send(event: unknown): void;
}
export class InterruptionController {
  #playbackStartedAt: number | null = null;
  #itemId: string | null = null;

  constructor(readonly audio: HTMLAudioElement, readonly sender: RealtimeEventSender) {}

  markPlaybackStarted(itemId: string, now = performance.now()): void {
    this.#itemId = itemId;
    this.#playbackStartedAt = now;
  }

  interrupt(now = performance.now()): void {
    if (!this.#itemId || this.#playbackStartedAt === null) return;
    const audioEndMs = Math.max(0, Math.round(now - this.#playbackStartedAt));
    this.audio.pause();
    this.audio.srcObject = null;
    this.sender.send({ type: 'response.cancel' });
    this.sender.send({
      type: 'conversation.item.truncate',
      item_id: this.#itemId,
      content_index: 0,
      audio_end_ms: audioEndMs,
    });
    this.#itemId = null;
    this.#playbackStartedAt = null;
  }
}
