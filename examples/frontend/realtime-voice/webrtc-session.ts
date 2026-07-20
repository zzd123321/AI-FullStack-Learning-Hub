import { adaptRealtimeEvent } from './realtime-event-adapter.js';
import type { VoiceAction } from './voice-session-reducer.js';

export interface WebRTCSessionHandle {
  readonly peer: RTCPeerConnection;
  readonly events: RTCDataChannel;
  send(event: unknown): void;
  close(): void;
}

export async function connectVoiceSession(
  microphoneTrack: MediaStreamTrack,
  remoteAudio: HTMLAudioElement,
  exchangeOffer: (offerSdp: string) => Promise<string>,
  onAction: (action: VoiceAction) => void,
): Promise<WebRTCSessionHandle> {
  const peer = new RTCPeerConnection();
  const events = peer.createDataChannel('oai-events');
  const handlePlaying = () => onAction({ type: 'audio-started' });
  remoteAudio.addEventListener('playing', handlePlaying);
  peer.addTrack(microphoneTrack);
  peer.addEventListener('track', (event) => {
    const [stream] = event.streams;
    remoteAudio.srcObject = stream ?? new MediaStream([event.track]);
    // Autoplay can still be rejected. Surface the failure so the UI can offer
    // a user-gesture “resume sound” button instead of pretending audio plays.
    void remoteAudio.play().catch(() => onAction({ type: 'audio-playback-blocked' }));
  });
  peer.addEventListener('connectionstatechange', () => {
    if (peer.connectionState === 'failed') {
      onAction({ type: 'fail', message: 'Realtime connection failed' });
    }
  });
  events.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    const action = adaptRealtimeEvent(event.data);
    if (action) onAction(action);
  });

  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    if (!offer.sdp) throw new Error('WebRTC offer did not contain SDP');
    const answerSdp = await exchangeOffer(offer.sdp);
    await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  } catch (error) {
    remoteAudio.removeEventListener('playing', handlePlaying);
    events.close();
    microphoneTrack.stop();
    peer.close();
    remoteAudio.srcObject = null;
    throw error;
  }

  return {
    peer,
    events,
    send(event) {
      if (events.readyState !== 'open') throw new Error('Realtime event channel is not open');
      events.send(JSON.stringify(event));
    },
    close() {
      remoteAudio.removeEventListener('playing', handlePlaying);
      events.close();
      peer.getSenders().forEach((sender) => sender.track?.stop());
      peer.close();
      remoteAudio.srcObject = null;
    },
  };
}
