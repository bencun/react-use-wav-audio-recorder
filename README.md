# React useWavAudioRecorder

`useWavAudioRecorder` records microphone input as a WAV Blob using [extendable-media-recorder](https://www.npmjs.com/package/extendable-media-recorder) and its [WAV encoder](https://www.npmjs.com/package/extendable-media-recorder-wav-encoder). Microphone access requires a secure context such as HTTPS or localhost.

## Installation

```sh
pnpm add react-use-wav-audio-recorder
```

## Record a WAV

```tsx
'use client';

import { useState } from 'react';
import { useWavAudioRecorder } from 'react-use-wav-audio-recorder';

export function Recorder() {
  const [audioBlob, setAudioBlob] = useState<Blob>();
  const [error, setError] = useState('');

  const { recording, startRecording, stopRecording } = useWavAudioRecorder({
    onComplete: setAudioBlob,
    onNoPermissionError: () => setError('Microphone access was denied.'),
    onNotSupportedError: () => setError('Audio recording is unavailable.'),
    onOtherError: (cause) => setError(cause?.message ?? 'Recording failed.'),
  });

  return (
    <>
      <button onClick={() => void startRecording()} disabled={recording}>Record</button>
      <button onClick={stopRecording} disabled={!recording}>Stop</button>
      {audioBlob && <p>Recorded {audioBlob.size} bytes.</p>}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
```

Wait for `onComplete` before starting another recording after Stop. It receives the finalized WAV Blob after the browser delivers the last audio data. If the recorder takes more than 30 seconds to finish stopping, the hook releases the microphone and calls `onOtherError`. Calling `stopRecording` during startup cancels that attempt. Unmounting releases the microphone and discards any unfinished recording.

## Convert WAV to MP3

`useWavToMp3Worker` uses [@breezystack/lamejs](https://www.npmjs.com/package/@breezystack/lamejs) in a Web Worker. It accepts mono or stereo 16-bit PCM WAV Blobs and requests 256 kbps from the encoder. The worker terminates when conversion settles or the hook unmounts. Conversion reports an error if the worker has not replied within 60 seconds.

```tsx
import { useWavToMp3Worker } from 'react-use-wav-audio-recorder';

const { convert, inProgress } = useWavToMp3Worker({
  onComplete: (mp3Blob) => {
    // Store or upload the MP3 Blob.
  },
  onError: (cause) => {
    console.error(cause);
  },
});

// Call convert(wavBlob) to start encoding.
```

### Vite development

Exclude the package from dependency optimization so Vite resolves its bundled worker asset during development.

```ts
export default defineConfig({
  optimizeDeps: {
    exclude: ['react-use-wav-audio-recorder'],
  },
});
```

## Development checks

Run `pnpm test` for unit tests. Install the Playwright browsers once with `pnpm exec playwright install chromium firefox webkit`, then run `pnpm test:e2e`. The browser tests exercise the packed library in a Vite development server and production build. Chromium and Firefox use fake microphones, and WebKit uses a synthetic audio stream.

## Credits

The initial MP3 encoder was inspired by [Record Audio in JS and Upload as WAV or MP3 File to Your Backend](https://franzeus.medium.com/record-audio-in-js-and-upload-as-wav-or-mp3-file-to-your-backend-1a2f35dea7e8).
