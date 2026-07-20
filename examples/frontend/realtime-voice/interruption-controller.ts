export interface RealtimeEventSender {
  send(event: unknown): void;
}

export interface ManagedAudioPlayback {
  // Stop immediately and report the confirmed played duration for this item.
  // A WebSocket PCM queue can calculate this from its audio clock and cursor.
  stopAndGetPlayedMs(itemId: string): number;
}

export class InterruptionController {
  #itemId: string | null = null;
  readonly playback: ManagedAudioPlayback;
  readonly sender: RealtimeEventSender;

  constructor(playback: ManagedAudioPlayback, sender: RealtimeEventSender) {
    this.playback = playback;
    this.sender = sender;
  }

  markPlaybackStarted(itemId: string): void {
    this.#itemId = itemId;
  }

  interrupt(): void {
    if (!this.#itemId) return;
    const audioEndMs = Math.max(0, Math.round(this.playback.stopAndGetPlayedMs(this.#itemId)));
    this.sender.send({ type: 'response.cancel' });
    this.sender.send({
      type: 'conversation.item.truncate',
      item_id: this.#itemId,
      content_index: 0,
      audio_end_ms: audioEndMs,
    });
    this.#itemId = null;
  }
}
