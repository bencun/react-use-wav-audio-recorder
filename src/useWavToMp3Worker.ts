import { useCallback, useRef, useState } from 'react';
import type { WorkerReply } from './MP3Worker';
import { useCommittedEffect } from './useCommittedEffect';

type Props = {
  onComplete: (data: Blob) => void;
  onError?: (e?: unknown) => void;
};

type Job = { cancel?: () => void };

const TIMEOUT_MS = 60_000;

function readReply(reply: WorkerReply) {
  if (reply?.ok === true && reply.blob instanceof Blob) return reply.blob;
  if (reply?.ok === false && typeof reply.message === 'string') throw new Error(reply.message);
  throw new Error('The MP3 worker sent an invalid reply.');
}

function runWorker(blob: Blob, job: Job) {
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL('./MP3Worker', import.meta.url));
    let settled = false;
    const timeout = setTimeout(() => fail(new Error('MP3 conversion timed out.')), TIMEOUT_MS);

    function cleanup() {
      if (settled) return false;
      settled = true;
      clearTimeout(timeout);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onMessageError);
      worker.terminate();
      return true;
    }

    function fail(error: unknown) {
      if (cleanup()) reject(error);
    }

    function onMessage(event: MessageEvent<WorkerReply>) {
      try {
        const result = readReply(event.data);
        if (cleanup()) resolve(result);
      } catch (error) {
        fail(error);
      }
    }

    function onError(event: ErrorEvent) {
      event.preventDefault();
      fail(new Error(event.message || 'The MP3 worker failed.'));
    }

    function onMessageError() {
      fail(new Error('The MP3 worker reply could not be decoded.'));
    }

    job.cancel = () => fail(new Error('MP3 conversion was cancelled.'));
    try {
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onMessageError);
      worker.postMessage(blob);
    } catch (error) {
      fail(error);
    }
  });
}

export function useWavToMp3Worker(props: Props) {
  const [inProgress, setInProgress] = useState(false);
  const active = useRef<Job>();
  const mounted = useRef(true);
  const callbacks = useRef(props);

  useCommittedEffect(() => {
    callbacks.current = props;
  });

  useCommittedEffect(() => {
    mounted.current = true;
    setInProgress(Boolean(active.current));
    return () => {
      mounted.current = false;
      const job = active.current;
      active.current = undefined;
      job?.cancel?.();
    };
  }, []);

  const convert = useCallback(async (blob: Blob) => {
    if (!mounted.current) return;
    if (active.current) throw new Error('Conversion is already in progress.');

    const job: Job = {};
    active.current = job;
    setInProgress(true);

    let result: Blob | undefined;
    let failure: unknown;
    try {
      result = await runWorker(blob, job);
    } catch (error) {
      failure = error;
    }

    if (active.current !== job) return;
    active.current = undefined;
    setInProgress(false);
    if (result) {
      try {
        await callbacks.current.onComplete(result);
      } catch (error) {
        if (mounted.current) callbacks.current.onError?.(error);
      }
    } else {
      callbacks.current.onError?.(failure);
    }
  }, []);

  return { convert, inProgress };
}
