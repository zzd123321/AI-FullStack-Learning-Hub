export function createAudioLevelMeter(stream: MediaStream, onLevel: (level: number) => void): {
  start(): Promise<void>;
  stop(): Promise<void>;
} {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  const samples = new Float32Array(analyser.fftSize);
  context.createMediaStreamSource(stream).connect(analyser);
  let frameId: number | null = null;

  const sample = () => {
    analyser.getFloatTimeDomainData(samples);
    const energy = samples.reduce((sum, value) => sum + value * value, 0) / samples.length;
    onLevel(Math.sqrt(energy));
    frameId = requestAnimationFrame(sample);
  };
  return {
    async start() {
      await context.resume();
      if (frameId === null) frameId = requestAnimationFrame(sample);
    },
    async stop() {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      await context.close();
    },
  };
}
