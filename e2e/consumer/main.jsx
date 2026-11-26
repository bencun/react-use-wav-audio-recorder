import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useWavAudioRecorder, useWavToMp3Worker } from 'react-use-wav-audio-recorder';

function App() {
  const [status, setStatus] = useState('Ready');
  const report = (error) => setStatus(String(error));

  const { convert } = useWavToMp3Worker({
    onError: report,
    async onComplete(blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (blob.type !== 'audio/mp3' || bytes.length < 100 || bytes[0] !== 255 || (bytes[1] & 224) !== 224) {
        throw new Error('Invalid MP3 output');
      }
      setStatus('Converted WAV to MP3');
    },
  });

  const { recording, startRecording, stopRecording } = useWavAudioRecorder({
    onNoPermissionError: () => report('Microphone permission denied'),
    onNotSupportedError: () => report('Recording unsupported'),
    onOtherError: report,
    async onComplete(blob) {
      const wav = new DataView(await blob.arrayBuffer());
      if (blob.type !== 'audio/wav' || wav.byteLength <= 44
        || wav.getUint32(0) !== 0x52494646 || wav.getUint32(8) !== 0x57415645
        || wav.getUint32(4, true) !== wav.byteLength - 8
        || wav.getUint32(40, true) !== wav.byteLength - 44) {
        throw new Error('Invalid or unfinalized WAV');
      }
      await convert(blob);
    },
  });

  return (
    <>
      <button onClick={() => {
        setStatus('Starting recording');
        void startRecording();
      }}>Record</button>
      <button disabled={!recording} onClick={() => {
        setStatus('Finalizing recording');
        stopRecording();
      }}>Stop</button>
      <button onClick={() => void convert(new Blob(['invalid']))}>Convert invalid WAV</button>
      <output>{status}</output>
    </>
  );
}

createRoot(document.querySelector('#root')).render(<React.StrictMode><App /></React.StrictMode>);
