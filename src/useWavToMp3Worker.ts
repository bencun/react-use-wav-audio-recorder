import { useCallback, useState } from 'react';

type Props = {
  onComplete: (data: Blob) => void;
  onError?: (e?: unknown) => void;
};

export function useWavToMp3Worker({ onComplete, onError }: Props) {
  const [inProgress, setInProgress] = useState(false);

  const convert = useCallback(async (blob: Blob) => {
    if (inProgress) throw new Error('Conversion is already in progress.');

    const worker = new Worker(new URL('./MP3Worker', import.meta.url));
    const workerWrapperPromise = new Promise<Blob>((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.terminate();
        reject();
      }, 60000);
      worker.addEventListener('message', (m: MessageEvent<Blob>) => {
        clearTimeout(timeout);
        resolve(m.data);
      });
      worker.addEventListener('error', () => {
        clearTimeout(timeout);
        reject();
      });
      worker.addEventListener('messageerror', () => {
        clearTimeout(timeout);
        reject();
      });
      worker.postMessage(blob);
    });

    setInProgress(true);
    try {
      const mp3blob = await workerWrapperPromise;
      onComplete(mp3blob);
    } catch (e) {
      onError?.(e);
    } finally {
      setInProgress(false);
    }
  }, [inProgress, onComplete, onError]);

  return {
    convert, inProgress,
  };
}
