'use client';

import {
  useCallback, useRef, useState,
} from 'react';
import {
  MediaRecorder as ExtendableMediaRecorder, IBlobEvent, IMediaRecorder, register,
} from 'extendable-media-recorder';
import { connect } from 'extendable-media-recorder-wav-encoder';

type Props = {
  onComplete: (recording: Blob) => void;
  onNotSupportedError?: () => void;
  onNoPermissionError?: () => void;
  onOtherError?: (e?: Error) => void;
};

const MIME_TYPE = 'audio/wav';

export function useWavAudioRecorder({
  onComplete, onNoPermissionError, onNotSupportedError, onOtherError,
}: Props) {
  const [recording, setRecording] = useState<boolean>(false);
  const mediaRecorder = useRef<IMediaRecorder>();
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream>();

  const getStream = useCallback(async () => {
    if (navigator?.mediaDevices?.getUserMedia) {
      // custom WAV codec registration first
      // this code prevents this being initialized multiple times
      // since there's no way to deregister currently
      // https://github.com/chrisguttandin/extendable-media-recorder/issues/680
      connect().then(async (port) => {
        if (!ExtendableMediaRecorder.isTypeSupported('audio/wav')) {
          await register(port);
        }
      });
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } else {
      onNotSupportedError?.();
    }
  }, [onNotSupportedError]);

  const closeStream = useCallback(async () => {
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const dataAvailableHandler = useCallback((e: IBlobEvent) => {
    if (e.data.size) chunks.current.push(e.data);
  }, []);

  const stopHandler = useCallback(async () => {
    // for some reason this gets called multiple times
    // (maybe because we're stopping stream tracks as well)
    // so we check if there's any actual data to process first
    if (chunks.current?.length) {
      const blob = new Blob(chunks.current, { type: MIME_TYPE });
      chunks.current = [];
      onComplete(blob);
    }
  }, [onComplete]);

  const startRecording = useCallback(async () => {
    // this is an unexpected scenario so we throw an error for visibility
    if (mediaRecorder.current) {
      onOtherError?.(new Error('Media recorder already instantiated'));
      return;
    }
    try {
      await getStream();
      // if the stream isn't available due to perms issues we fail
      if (!stream.current) {
        throw new Error();
      }
    } catch (e) {
      onNoPermissionError?.();
      return;
    }

    mediaRecorder.current = stream ? new ExtendableMediaRecorder(stream.current, { mimeType: MIME_TYPE }) : undefined;
    if (mediaRecorder.current) {
      mediaRecorder.current.addEventListener('dataavailable', dataAvailableHandler);
      mediaRecorder.current.addEventListener('stop', stopHandler);
      mediaRecorder.current.start(100);
      setRecording(true);
    } else {
      closeStream();
      onOtherError?.(new Error('startRecording: Failed to instantiate MediaRecorder'));
    }
  }, [closeStream, dataAvailableHandler, getStream, onNoPermissionError, onOtherError, stopHandler]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      mediaRecorder.current.removeEventListener('dataavailable', dataAvailableHandler);
      mediaRecorder.current.addEventListener('stop', stopHandler);
      closeStream();
      setRecording(false);
      mediaRecorder.current = undefined;
    } else {
      onOtherError?.(new Error('stopRecording: MediaRecorder unavailable.'));
    }
  }, [closeStream, dataAvailableHandler, onOtherError, stopHandler]);

  return {
    recording,
    startRecording,
    stopRecording,
  };
}
