# React useWavAudioRecorder

This is a simple React hook that uses [`extendable-media-recorder`](https://www.npmjs.com/package/extendable-media-recorder) and [extendable-media-recorder-wav-encoder](https://www.npmjs.com/package/extendable-media-recorder-wav-encoder) under the hood to record raw WAV audio in a cross-browser compatible manner. It produces a Blob of the WAV audio.

## Installation

Install as `react-use-wav-audio-recorder` from NPM:

```sh
pnpm i react-use-wav-audio-recorder
```

## Usage

```typescript
function MyComponent() {
  const [audioBlob, setAudioBlob] = useState<Blob>();
  
  const {
    // recording status flag
    recording,
    // a method to start the permission grant flow and start recording immediately afterwards
    startRecording,
    // a method to stop the recording
    stopRecording
    } = useWavAudioRecorder({
    onComplete: async (blob) => {
      // store the blob
      setAudioBlob(setAudioUrl(window.URL.createObjectURL(blob)));
      // ... or you can convert it to an object URL so it can be assigned to an <audio> element
      // setAudioUrl(window.URL.createObjectURL(blob));
      // ... or you can turn it to a File so you can upload it later etc.
      // const file = new File([blob], 'recording.wav');
    },
    onNoPermissionError: () => {
      // Called when recording permissions coudln't be obtained
    },
    onNotSupportedError: () => {
      // Called when browser doesn't support recording
    },
    onOtherError: (e) => {
      // Called on any other unexpected errors
    },
  });

  // ...wire up the props to buttons etc.
}
```

## MP3 compression
There's also a utility hook called `useWavToMp3Worker` that uses [@breezystack/lamejs](https://www.npmjs.com/package/@breezystack/lamejs) to encode the WAV into an MP3 file using a Web Worker so that the main thread isn't blocked during the encoding process.

The bitrate of the MP3 is currently fixed to 256 Kbps but this will be made into a parametrized value in the future (feel free to open a PR!).

The worker is also set to terminate after 60 seconds (feel free to open a PR to parametrize this as well).

### Web Worker issues with Vite

Vite has some [issues](https://github.com/vitejs/vite/discussions/15547) with resolving the library-mode-bundled Web Workers. In order for the Web Worker to work properly during development you should add this to your `vite.config.ts` `optimizeDeps.exclude` field:

```typescript
export default defineConfig({
  // ...
  optimizeDeps: {
    exclude: ['react-use-wav-audio-recorder']
  }
  // ...
})

```

In production builds everything seems to be working just fine without the `optimizeDeps.exclude` entry.

### Usage

```typescript
const {
  // a method to start the encoding process, accepts a Blob
  convert,
  // a flag telling you if the process is in progress
  inProgress
} = useWavToMp3Worker({
  onComplete: async (blob) => {
    // here you grab the processed blob just like with the WAV recording and do whatever you please with it
  },
  onError: (e) => {
    // this is called if any errors occur
  },
});
```

## Credits
Here's a great [article](https://franzeus.medium.com/record-audio-in-js-and-upload-as-wav-or-mp3-file-to-your-backend-1a2f35dea7e8) that was used for the initial implementation of the MP3 encoder and inspired the creation of these hooks.