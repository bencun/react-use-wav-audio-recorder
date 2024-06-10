/* eslint-disable no-restricted-globals */
import * as lamejs from '@breezystack/lamejs';

async function wavBlobToMp3Blob(blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const dataView = new DataView(arrayBuffer);
  // @ts-expect-error - No idea
  const wavDecoder = lamejs.WavHeader.readHeader(dataView);
  // now we split the ArrayBuffer into two channels when we have two channels (rip my sanity 2024)
  const numberOfChannels = wavDecoder.channels as number;
  const bytesPerSample = numberOfChannels * 2;
  const numberOfSamples = ((arrayBuffer.byteLength - wavDecoder.dataOffset) / 2);
  const channelLength = numberOfSamples / numberOfChannels;
  const leftChannel = new Int16Array(channelLength);
  const rightChannel = new Int16Array(channelLength);
  let sampleIndex = 0;
  for (let i = wavDecoder.dataOffset; i < arrayBuffer.byteLength; i += bytesPerSample) {
    leftChannel[sampleIndex] = dataView.getInt16(i, true);
    if (numberOfChannels === 2) {
      rightChannel[sampleIndex] = dataView.getInt16(i + 2, true);
    }
    sampleIndex += 1;
  }
  // Create an MP3 encoder
  const mp3Encoder = new lamejs.Mp3Encoder(numberOfChannels, wavDecoder.sampleRate, 256);
  // Encode the WAV samples to MP3
  const mp3Buffer = mp3Encoder.encodeBuffer(leftChannel, rightChannel);
  // Finalize the MP3 encoding
  const mp3Data = mp3Encoder.flush();
  // Combine the MP3 header and data into a new ArrayBuffer
  const mp3BufferWithHeader = new Uint8Array(mp3Buffer.length + mp3Data.length);
  mp3BufferWithHeader.set(mp3Buffer, 0);
  mp3BufferWithHeader.set(mp3Data, mp3Buffer.length);
  // Create a Blob from the ArrayBuffer
  const mp3Blob = new Blob([mp3BufferWithHeader], { type: 'audio/mp3' });
  return mp3Blob;
}

addEventListener('message', (ev: MessageEvent<Blob>) => {
  wavBlobToMp3Blob(ev.data).then(
    (mp3blob) => postMessage(mp3blob),
  );
});
