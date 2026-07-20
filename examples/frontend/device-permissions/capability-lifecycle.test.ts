import { classifyPositionError } from './capability-request.js';
import { ownMediaTracks, type TrackLike } from './media-resource-owner.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  classifyPositionError({ code: 1 }).kind === 'blocked',
  'PERMISSION_DENIED can represent permission or policy blocking',
);
const timedOut = classifyPositionError({ code: 3 });
assert(
  timedOut.kind === 'failed' && timedOut.reason === 'timeout',
  'geolocation timeout should stay distinct from permission blocking',
);

function fakeTrack(): TrackLike & { stopped: boolean; endExternally(): void } {
  let endedListener: (() => void) | null = null;
  return {
    readyState: 'live',
    stopped: false,
    stop() { this.stopped = true; },
    addEventListener(_type, listener) { endedListener = listener; },
    removeEventListener(_type, listener) {
      if (endedListener === listener) endedListener = null;
    },
    endExternally() { endedListener?.(); },
  };
}

const camera = fakeTrack();
const microphone = fakeTrack();
let endReason: string | null = null;
const owner = ownMediaTracks([camera, microphone], (reason) => { endReason = reason; });

camera.endExternally();
assert(endReason === 'track-ended', 'external track end should update product state');
assert(camera.stopped && microphone.stopped, 'session policy should release every remaining track');

// Cleanup is idempotent and must not publish a second terminal transition.
owner.stop();
assert(endReason === 'track-ended', 'second stop should be ignored');

console.log('device capability lifecycle examples passed');
