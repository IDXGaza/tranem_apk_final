const writeWavString = (view: DataView, offset: number, str: string) => {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
};

const mixToMonoFloat32 = (audioBuffer: AudioBuffer): Float32Array => {
  const length = audioBuffer.length;
  const numChannels = audioBuffer.numberOfChannels;
  if (numChannels <= 1) {
    return audioBuffer.getChannelData(0);
  }
  const mixed = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mixed[i] += data[i];
    }
  }
  const scale = 1 / numChannels;
  for (let i = 0; i < length; i++) {
    mixed[i] *= scale;
  }
  return mixed;
};

const downsampleMono = (
  input: Float32Array,
  inRate: number,
  outRate: number
): Float32Array => {
  if (inRate === outRate || inRate <= 0 || outRate <= 0) {
    return input;
  }
  const ratio = inRate / outRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = input[Math.min(idx, input.length - 1)] || 0;
    const s1 = input[Math.min(idx + 1, input.length - 1)] || s0;
    result[i] = s0 + (s1 - s0) * frac;
  }
  return result;
};

export const encodeAudioBufferToWavBlob = async (
  audioBuffer: AudioBuffer,
  maxSampleRate = 22050
): Promise<Blob> => {
  const targetSampleRate = Math.min(audioBuffer.sampleRate || maxSampleRate, maxSampleRate);
  let samples: Float32Array;

  if (typeof OfflineAudioContext !== 'undefined' && audioBuffer.sampleRate !== targetSampleRate) {
    try {
      const targetFrames = Math.max(1, Math.ceil(audioBuffer.duration * targetSampleRate));
      const offlineCtx = new OfflineAudioContext(1, targetFrames, targetSampleRate);
      const bufferSource = offlineCtx.createBufferSource();
      bufferSource.buffer = audioBuffer;
      bufferSource.connect(offlineCtx.destination);
      bufferSource.start(0);
      const rendered = await offlineCtx.startRendering();
      samples = rendered.getChannelData(0);
    } catch {
      const mono = mixToMonoFloat32(audioBuffer);
      samples = downsampleMono(mono, audioBuffer.sampleRate, targetSampleRate);
    }
  } else {
    const mono = mixToMonoFloat32(audioBuffer);
    samples = downsampleMono(mono, audioBuffer.sampleRate, targetSampleRate);
  }

  const numSamples = samples.length;
  const dataByteLength = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  writeWavString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeWavString(view, 8, 'WAVE');
  writeWavString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeWavString(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

export const transcodeNonSeekableBlobToWav = async (
  blob: Blob
): Promise<{ blob: Blob; duration: number } | null> => {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioCtx();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const wavBlob = await encodeAudioBufferToWavBlob(audioBuffer, 22050);
    return {
      blob: wavBlob,
      duration: isFinite(audioBuffer.duration) && audioBuffer.duration > 0 ? audioBuffer.duration : 0
    };
  } catch (err) {
    console.warn('Could not transcode audio blob to seekable WAV:', err);
    return null;
  } finally {
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
  }
};
