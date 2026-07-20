export function float32ToPcm16(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const input = samples[index]!;
    // Broken DSP input should become silence, not an implicit NaN conversion.
    const sample = Number.isFinite(input) ? Math.max(-1, Math.min(1, input)) : 0;
    output[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return output;
}
