import { Mp3Encoder } from '@breezystack/lamejs';
import { readWav } from './readWav';

export type WorkerReply =
  | { ok: true; blob: Blob }
  | { ok: false; message: string };

async function convert(blob: Blob) {
  const view = new DataView(await blob.arrayBuffer());
  const { channels, sampleRate, offset, frames } = readWav(view);
  const encoder = new Mp3Encoder(channels, sampleRate, 256);
  const blockSize = 1152;
  const left = new Int16Array(blockSize);
  const right = new Int16Array(blockSize);
  const parts: Uint8Array[] = [];

  for (let frame = 0; frame < frames; frame += blockSize) {
    const length = Math.min(blockSize, frames - frame);
    for (let i = 0; i < length; i++) {
      const position = offset + (frame + i) * channels * 2;
      left[i] = view.getInt16(position, true);
      if (channels === 2) right[i] = view.getInt16(position + 2, true);
    }
    const bytes = encoder.encodeBuffer(left.subarray(0, length), right.subarray(0, length));
    if (bytes.length) parts.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  }
  parts.push(new Uint8Array(encoder.flush()));
  return new Blob(parts, { type: 'audio/mp3' });
}

addEventListener('message', async (event: MessageEvent<Blob>) => {
  let reply: WorkerReply;
  try {
    reply = { ok: true, blob: await convert(event.data) };
  } catch (error) {
    reply = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  postMessage(reply);
});
