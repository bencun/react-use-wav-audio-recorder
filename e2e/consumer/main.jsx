import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useWavAudioRecorder, useWavToMp3Worker } from 'react-use-wav-audio-recorder';

function AudioFile({ blob, format }) {
  const [url, setUrl] = useState();

  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }

    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  return (
    <section className="audio-file" aria-label={format + ' recording'}>
      <h2>{format}</h2>
      <audio aria-label={format + ' player'} controls preload="metadata" src={url} />
      {url ? (
        <a className="download" href={url} download={`recording.${format.toLowerCase()}`}>Download {format}</a>
      ) : (
        <button disabled>Download {format}</button>
      )}
    </section>
  );
}

function App() {
  const [status, setStatus] = useState('Ready');
  const [wavBlob, setWavBlob] = useState();
  const [mp3Blob, setMp3Blob] = useState();
  const report = (error) => setStatus(String(error));

  const { convert } = useWavToMp3Worker({
    onError: report,
    async onComplete(blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (blob.type !== 'audio/mp3' || bytes.length < 100 || bytes[0] !== 255 || (bytes[1] & 224) !== 224) {
        throw new Error('Invalid MP3 output');
      }
      setMp3Blob(blob);
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
      setWavBlob(blob);
      setMp3Blob(undefined);
      await convert(blob);
    },
  });

  return (
    <main>
      <h1>Recorder smoke test</h1>
      <div className="recorder-controls">
        <div className="actions">
          <button onClick={() => {
            setStatus('Starting recording');
            void startRecording();
          }}>Record</button>
          <button disabled={!recording} onClick={() => {
            setStatus('Finalizing recording');
            stopRecording();
          }}>Stop</button>
          <button onClick={() => void convert(new Blob(['invalid']))}>Convert invalid WAV</button>
        </div>
        <output>{status}</output>
      </div>

      <div className="audio-files">
        <AudioFile blob={wavBlob} format="WAV" />
        <AudioFile blob={mp3Blob} format="MP3" />
      </div>
    </main>
  );
}

createRoot(document.querySelector('#root')).render(<React.StrictMode><App /></React.StrictMode>);
