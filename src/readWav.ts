const RIFF = 0x52494646;
const WAVE = 0x57415645;
const FORMAT = 0x666d7420;
const DATA = 0x64617461;

// The streaming encoder uses these fields in its initial 44-byte PCM header.
const STREAMING_DATA_SIZE = 0xffffffd3;
const STREAMING_RIFF_SIZE = STREAMING_DATA_SIZE + 36;

function invalid(reason: string): never {
  throw new Error(`Invalid WAV: ${reason}`);
}

export function readWav(view: DataView) {
  if (view.byteLength < 12 || view.getUint32(0) !== RIFF || view.getUint32(8) !== WAVE) {
    invalid('expected a RIFF/WAVE header.');
  }

  const riffSize = view.getUint32(4, true);
  const streaming = riffSize === STREAMING_RIFF_SIZE
    && view.byteLength >= 44
    && view.getUint32(12) === FORMAT
    && view.getUint32(16, true) === 16
    && view.getUint32(36) === DATA
    && view.getUint32(40, true) === STREAMING_DATA_SIZE;
  const end = streaming ? view.byteLength : riffSize + 8;
  if (end < 12 || end > view.byteLength) invalid('RIFF size is out of bounds.');

  let format: { channels: number; sampleRate: number; frameSize: number } | undefined;
  let data: { offset: number; size: number } | undefined;
  for (let position = 12; position < end;) {
    if (position + 8 > end) invalid('incomplete chunk header.');
    const id = view.getUint32(position);
    const offset = position + 8;
    const size = streaming && id === DATA ? end - offset : view.getUint32(position + 4, true);
    position = offset + size + (streaming && id === DATA ? 0 : size % 2);
    if (position > end) invalid('chunk extends past the RIFF boundary.');

    if (id === FORMAT && !format) {
      if (size < 16) invalid('incomplete format chunk.');
      const encoding = view.getUint16(offset, true);
      const channels = view.getUint16(offset + 2, true);
      const sampleRate = view.getUint32(offset + 4, true);
      const bits = view.getUint16(offset + 14, true);
      if (encoding !== 1 || bits !== 16 || (channels !== 1 && channels !== 2)) {
        invalid('expected mono or stereo 16-bit PCM.');
      }
      const frameSize = channels * 2;
      if (!sampleRate || view.getUint16(offset + 12, true) !== frameSize
        || view.getUint32(offset + 8, true) !== sampleRate * frameSize) {
        invalid('inconsistent sample rate or frame size.');
      }
      format = { channels, sampleRate, frameSize };
    } else if (id === DATA && !data) {
      data = { offset, size };
    }
  }

  if (!format || !data) invalid('missing format or audio data chunk.');
  const frames = Math.floor(data.size / format.frameSize);
  if (!frames || (!streaming && data.size % format.frameSize)) {
    invalid('audio data must contain complete PCM frames.');
  }
  return { channels: format.channels, sampleRate: format.sampleRate, offset: data.offset, frames };
}
