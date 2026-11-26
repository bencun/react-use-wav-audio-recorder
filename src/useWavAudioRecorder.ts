import { useCallback, useRef, useState } from 'react';
import type { IBlobEvent, IMediaRecorder } from 'extendable-media-recorder';
import { useCommittedEffect } from './useCommittedEffect';

type Props = {
  onComplete: (recording: Blob) => void;
  onNotSupportedError?: () => void;
  onNoPermissionError?: () => void;
  onOtherError?: (e?: Error) => void;
};

type Session = {
  stream?: MediaStream;
  recorder?: IMediaRecorder;
  detach?: () => void;
  stopping?: boolean;
  stopTimeout?: ReturnType<typeof setTimeout>;
  chunks: Blob[];
};

const MIME_TYPE = 'audio/wav';
const STOP_TIMEOUT_MS = 30_000;

async function loadRecorder() {
  const { MediaRecorder, register } = await import('extendable-media-recorder');
  if (!MediaRecorder.isTypeSupported(MIME_TYPE)) {
    const { connect } = await import('extendable-media-recorder-wav-encoder');
    const port = await connect();
    try {
      await register(port);
    } catch (error) {
      port.close();
      throw error;
    }
  }
  return MediaRecorder;
}

let recorderReady: ReturnType<typeof loadRecorder> | undefined;

function getRecorder() {
  recorderReady ??= loadRecorder().catch((error: unknown) => {
    recorderReady = undefined;
    throw error;
  });
  return recorderReady;
}

function releaseTracks(stream?: MediaStream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function cleanup(session: Session, abort: boolean) {
  clearTimeout(session.stopTimeout);
  session.detach?.();
  try {
    if (abort && session.recorder && session.recorder.state !== 'inactive') {
      session.recorder.stop();
    }
  } finally {
    releaseTracks(session.stream);
    session.chunks.length = 0;
  }
}

function asError(value: unknown) {
  if (value instanceof Error) return value;
  if (value instanceof DOMException) {
    const error = new Error(value.message);
    error.name = value.name;
    return error;
  }
  return new Error(String(value));
}

export function useWavAudioRecorder(props: Props) {
  const [recording, setRecording] = useState(false);
  const active = useRef<Session | undefined>(undefined);
  const mounted = useRef(true);
  const callbacks = useRef(props);

  useCommittedEffect(() => {
    callbacks.current = props;
  });

  useCommittedEffect(() => {
    mounted.current = true;
    setRecording(Boolean(active.current?.recorder && !active.current.stopping));
    return () => {
      mounted.current = false;
      const session = active.current;
      active.current = undefined;
      if (session) {
        try {
          cleanup(session, true);
        } catch {
          // The component is gone and cleanup has already released its tracks.
        }
      }
    };
  }, []);

  const finish = useCallback((session: Session, abort: boolean) => {
    if (active.current !== session) return;
    active.current = undefined;
    setRecording(false);
    try {
      cleanup(session, abort);
    } catch {
      // Preserve the original recorder failure after releasing its tracks.
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!mounted.current) return;
    if (active.current) {
      callbacks.current.onOtherError?.(new Error('A recording is already in progress.'));
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      callbacks.current.onNotSupportedError?.();
      return;
    }

    const session: Session = { chunks: [] };
    active.current = session;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (value) {
      if (active.current !== session) return;
      finish(session, true);
      const error = asError(value);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        callbacks.current.onNoPermissionError?.();
      } else {
        callbacks.current.onOtherError?.(error);
      }
      return;
    }

    if (active.current !== session) {
      releaseTracks(stream);
      return;
    }
    session.stream = stream;

    try {
      const Recorder = await getRecorder();
      if (active.current !== session) return;

      const recorder = new Recorder(stream, { mimeType: MIME_TYPE });
      session.recorder = recorder;

      const onData = (event: IBlobEvent) => {
        if (active.current === session && event.data.size) session.chunks.push(event.data);
      };
      const onStop = () => {
        if (active.current !== session) return;
        const blob = session.chunks.length ? new Blob(session.chunks, { type: MIME_TYPE }) : undefined;
        finish(session, false);
        if (!blob) return;
        try {
          void Promise.resolve(callbacks.current.onComplete(blob)).catch((error: unknown) => {
            if (mounted.current) callbacks.current.onOtherError?.(asError(error));
          });
        } catch (error) {
          callbacks.current.onOtherError?.(asError(error));
        }
      };
      const onError = (event: Event) => {
        if (active.current !== session) return;
        finish(session, true);
        const error = 'error' in event ? event.error : undefined;
        callbacks.current.onOtherError?.(asError(error ?? 'Audio recording failed.'));
      };
      session.detach = () => {
        recorder.removeEventListener('dataavailable', onData);
        recorder.removeEventListener('stop', onStop);
        recorder.removeEventListener('error', onError);
      };
      recorder.addEventListener('dataavailable', onData);
      recorder.addEventListener('stop', onStop);
      recorder.addEventListener('error', onError);
      recorder.start();
      if (active.current === session) setRecording(true);
    } catch (value) {
      if (active.current !== session) return;
      finish(session, true);
      const error = asError(value);
      if (error.name === 'NotSupportedError') {
        callbacks.current.onNotSupportedError?.();
      } else {
        callbacks.current.onOtherError?.(error);
      }
    }
  }, [finish]);

  const stopRecording = useCallback(() => {
    if (!mounted.current) return;
    const session = active.current;
    if (!session) {
      callbacks.current.onOtherError?.(new Error('No recording is in progress.'));
      return;
    }
    if (!session.recorder) {
      finish(session, true);
      return;
    }
    if (session.stopping) return;
    session.stopping = true;
    setRecording(false);
    session.stopTimeout = setTimeout(() => {
      if (active.current !== session) return;
      finish(session, true);
      callbacks.current.onOtherError?.(new Error('The recorder did not finish stopping.'));
    }, STOP_TIMEOUT_MS);

    try {
      if (session.recorder.state !== 'inactive') session.recorder.stop();
    } catch (error) {
      if (active.current !== session) return;
      finish(session, false);
      callbacks.current.onOtherError?.(asError(error));
    }
  }, [finish]);

  return { recording, startRecording, stopRecording };
}
