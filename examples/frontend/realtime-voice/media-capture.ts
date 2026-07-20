export interface MicrophoneHandle {
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  mute(muted: boolean): void;
  stop(): void;
}

export async function requestMicrophone(deviceId?: string): Promise<MicrophoneHandle> {
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  };
  if (deviceId) audio.deviceId = { exact: deviceId };
  const stream = await navigator.mediaDevices.getUserMedia({
    audio,
    video: false,
  });
  const track = stream.getAudioTracks()[0];
  if (!track) {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error('No microphone track was returned');
  }
  return {
    stream,
    track,
    mute: (muted) => { track.enabled = !muted; },
    stop: () => stream.getTracks().forEach((item) => item.stop()),
  };
}

export function describeMediaError(error: unknown): 'denied' | 'missing' | 'busy' | 'unavailable' {
  if (!(error instanceof DOMException)) return 'unavailable';
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'denied';
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'missing';
  if (error.name === 'NotReadableError') return 'busy';
  return 'unavailable';
}
