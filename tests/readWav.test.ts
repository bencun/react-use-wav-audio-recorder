import { describe, expect, it } from 'vitest';
import { readWav } from '../src/readWav';

type WavOptions = {
  channels?: number;
  audioBytes?: number;
  extraChunk?: boolean;
  streaming?: boolean;
};

function wav({ channels = 1, audioBytes = channels * 4, extraChunk = false, streaming = false }: WavOptions = {}) {
  const size = 44 + audioBytes + audioBytes % 2 + (extraChunk ? 10 : 0);
  const view = new DataView(new ArrayBuffer(size));
  view.setUint32(0, 0x52494646);
  view.setUint32(4, streaming ? 0xfffffff7 : size - 8, true);
  view.setUint32(8, 0x57415645);
  view.setUint32(12, 0x666d7420);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, 44100, true);
  view.setUint32(28, 44100 * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461);
  view.setUint32(40, streaming ? 0xffffffd3 : audioBytes, true);
  if (extraChunk) {
    const offset = size - 10;
    view.setUint32(offset, 0x4a554e4b);
    view.setUint32(offset + 4, 1, true);
    view.setUint8(offset + 8, 42);
  }
  return view;
}

describe('readWav', () => {
  it.each([1, 2])('reads the declared payload for %i channels and ignores padded trailing metadata', (channels) => {
    expect(readWav(wav({ channels, extraChunk: true }))).toEqual({
      channels, sampleRate: 44100, offset: 44, frames: 2,
    });
  });

  it('recognizes canonical legacy streaming headers and reads complete frames', () => {
    expect(readWav(wav({ channels: 2, audioBytes: 9, streaming: true })).frames).toBe(2);
    const invalid = wav({ streaming: true });
    invalid.setUint32(40, 0xffffffff, true);
    expect(() => readWav(invalid)).toThrow('RIFF size');
  });

  it('rejects invalid container bounds, unsupported formats, and incomplete frames', () => {
    expect(() => readWav(new DataView(new ArrayBuffer(6)))).toThrow('RIFF/WAVE');
    expect(() => readWav(wav({ channels: 3 }))).toThrow('mono or stereo');
    expect(() => readWav(wav({ channels: 2, audioBytes: 2 }))).toThrow('complete PCM frames');
    const truncated = wav();
    truncated.setUint32(40, 4096, true);
    expect(() => readWav(truncated)).toThrow('RIFF boundary');
  });
});
