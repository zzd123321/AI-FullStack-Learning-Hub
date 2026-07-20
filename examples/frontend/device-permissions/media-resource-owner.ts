export interface TrackLike {
  readonly readyState: 'live' | 'ended';
  stop(): void;
  addEventListener(type: 'ended', listener: () => void): void;
  removeEventListener(type: 'ended', listener: () => void): void;
}

export interface OwnedMediaResource {
  stop(): void;
}

export function ownMediaTracks(
  tracks: readonly TrackLike[],
  onEnded: (reason: 'owner-stop' | 'track-ended') => void,
): OwnedMediaResource {
  let ended = false;

  const finish = (reason: 'owner-stop' | 'track-ended') => {
    if (ended) return;
    ended = true;
    for (const track of tracks) {
      track.removeEventListener('ended', trackEnded);
      if (track.readyState === 'live') track.stop();
    }
    // Calling MediaStreamTrack.stop() does not dispatch `ended`, so the owner
    // explicitly publishes the state transition for both shutdown paths.
    onEnded(reason);
  };

  // This example treats all tracks as one product session: if a camera or mic
  // ends externally, it closes the remaining tracks instead of capturing a
  // surprising partial session. Other products may define a different policy.
  const trackEnded = () => finish('track-ended');
  for (const track of tracks) track.addEventListener('ended', trackEnded);

  return { stop: () => finish('owner-stop') };
}
