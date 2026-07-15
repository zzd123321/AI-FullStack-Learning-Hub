export interface VoiceConnectionStats {
  readonly roundTripTimeMs: number | null;
  readonly jitterMs: number | null;
  readonly packetsLost: number;
  readonly packetsReceived: number;
}
export async function readVoiceStats(peer: RTCPeerConnection): Promise<VoiceConnectionStats> {
  const report = await peer.getStats();
  let roundTripTimeMs: number | null = null;
  let jitterMs: number | null = null;
  let packetsLost = 0;
  let packetsReceived = 0;
  report.forEach((entry) => {
    if (entry.type === 'candidate-pair' && entry.state === 'succeeded' && typeof entry.currentRoundTripTime === 'number') {
      roundTripTimeMs = entry.currentRoundTripTime * 1_000;
    }
    if (entry.type === 'inbound-rtp' && entry.kind === 'audio') {
      if (typeof entry.jitter === 'number') jitterMs = entry.jitter * 1_000;
      packetsLost += typeof entry.packetsLost === 'number' ? entry.packetsLost : 0;
      packetsReceived += typeof entry.packetsReceived === 'number' ? entry.packetsReceived : 0;
    }
  });
  return { roundTripTimeMs, jitterMs, packetsLost, packetsReceived };
}
