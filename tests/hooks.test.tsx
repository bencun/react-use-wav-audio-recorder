// @vitest-environment jsdom
import { act, StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWavToMp3Worker } from '../src/useWavToMp3Worker';

class Recorder extends EventTarget {
  static instances: Recorder[] = [];
  static isTypeSupported = vi.fn(() => false);
  static construct = vi.fn();
  state = 'inactive';
  start = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => { this.state = 'inactive'; });
  removeEventListener = vi.fn(super.removeEventListener.bind(this));

  constructor() {
    super();
    Recorder.construct();
    Recorder.instances.push(this);
  }

  data(blob: Blob) {
    this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: blob }));
  }
}

class Worker extends EventTarget {
  static instances: Worker[] = [];
  static construct = vi.fn();
  static post = vi.fn();
  terminate = vi.fn();

  constructor() {
    super();
    Worker.construct();
    Worker.instances.push(this);
  }

  postMessage(blob: Blob) {
    Worker.post(blob);
  }

  reply(reply: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: reply }));
  }
}

const { connect, register, closePort } = vi.hoisted(() => ({
  connect: vi.fn(),
  register: vi.fn(),
  closePort: vi.fn(),
}));
vi.mock('extendable-media-recorder', () => ({ MediaRecorder: Recorder, register }));
vi.mock('extendable-media-recorder-wav-encoder', () => ({ connect }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function streamWithTrack() {
  const stop = vi.fn();
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
}

let root: Root | undefined;
let host: HTMLDivElement;
let useWavAudioRecorder: typeof import('../src/useWavAudioRecorder').useWavAudioRecorder;
const getUserMedia = vi.fn();

function mountHook<Props, Result>(useHook: (props: Props) => Result, props: Props) {
  let current: Result;
  function Probe(props: { input: Props }) {
    current = useHook(props.input);
    return null;
  }
  function render(input: Props) {
    act(() => root?.render(<StrictMode><Probe input={input} /></StrictMode>));
  }
  render(props);
  return { get current() { return current; }, render };
}

function unmount() {
  act(() => root?.unmount());
  root = undefined;
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Worker', Worker);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  Recorder.instances = [];
  Recorder.isTypeSupported.mockReturnValue(false);
  Worker.instances = [];
  connect.mockResolvedValue({ close: closePort });
  host = document.createElement('div');
  root = createRoot(host);
  ({ useWavAudioRecorder } = await import('../src/useWavAudioRecorder'));
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useWavAudioRecorder', () => {
  it('claims startup immediately and releases a cancelled permission result without disturbing a retry', async () => {
    const pending = deferred<MediaStream>();
    const cancelled = streamWithTrack();
    const current = streamWithTrack();
    getUserMedia.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(current.stream);
    const onOtherError = vi.fn();
    const hook = mountHook(useWavAudioRecorder, { onComplete: vi.fn(), onOtherError });

    let first!: Promise<void>;
    act(() => {
      first = hook.current.startRecording();
      void hook.current.startRecording();
      hook.current.stopRecording();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(onOtherError).toHaveBeenCalledTimes(1);

    await act(async () => hook.current.startRecording());
    pending.resolve(cancelled.stream);
    await act(async () => first);
    expect(cancelled.stop).toHaveBeenCalledTimes(1);
    expect(current.stop).not.toHaveBeenCalled();
    expect(Recorder.instances).toHaveLength(1);
    expect(hook.current.recording).toBe(true);
    unmount();
    expect(current.stop).toHaveBeenCalledTimes(1);
    expect(Recorder.instances[0].stop).toHaveBeenCalledTimes(1);
  });

  it('keeps ownership until final data and stop, then calls the latest callback once', async () => {
    const { stream, stop } = streamWithTrack();
    getUserMedia.mockResolvedValue(stream);
    const original = vi.fn();
    const latest = vi.fn();
    const onOtherError = vi.fn();
    const hook = mountHook(useWavAudioRecorder, { onComplete: original, onOtherError });

    await act(async () => hook.current.startRecording());
    const recorder = Recorder.instances[0];
    expect(recorder.start).toHaveBeenCalledWith();
    hook.render({ onComplete: latest, onOtherError });
    act(() => {
      hook.current.stopRecording();
      hook.current.stopRecording();
      void hook.current.startRecording();
    });
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(latest).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();

    act(() => {
      recorder.data(new Blob(['final-data']));
      recorder.dispatchEvent(new Event('stop'));
      recorder.data(new Blob(['late-data']));
      recorder.dispatchEvent(new Event('stop'));
    });
    expect(original).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest.mock.calls[0][0]).toMatchObject({ size: 10, type: 'audio/wav' });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(recorder.removeEventListener).toHaveBeenCalledTimes(3);
  });

  it('releases the microphone and accepts another start if the recorder never finishes stopping', async () => {
    vi.useFakeTimers();
    const first = streamWithTrack();
    const retry = streamWithTrack();
    getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(retry.stream);
    const onComplete = vi.fn();
    const onOtherError = vi.fn();
    const hook = mountHook(useWavAudioRecorder, { onComplete, onOtherError });
    await act(async () => hook.current.startRecording());
    act(() => {
      hook.current.stopRecording();
      vi.advanceTimersByTime(30_000);
    });
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(onOtherError).toHaveBeenCalledWith(expect.objectContaining({ message: 'The recorder did not finish stopping.' }));
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => hook.current.startRecording());
    act(() => {
      Recorder.instances[0].data(new Blob(['late audio']));
      Recorder.instances[0].dispatchEvent(new Event('stop'));
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(hook.current.recording).toBe(true);
    expect(retry.stop).not.toHaveBeenCalled();
  });

  it('awaits shared registration across hooks and retries after a registration failure', async () => {
    const firstStream = streamWithTrack();
    const secondStream = streamWithTrack();
    const registration = deferred<void>();
    getUserMedia.mockResolvedValueOnce(firstStream.stream).mockResolvedValue(secondStream.stream);
    register.mockRejectedValueOnce(new Error('registration failed')).mockReturnValue(registration.promise);
    const onOtherError = vi.fn();
    const first = mountHook(useWavAudioRecorder, { onComplete: vi.fn(), onOtherError });
    await act(async () => first.current.startRecording());
    expect(onOtherError).toHaveBeenCalledWith(expect.objectContaining({ message: 'registration failed' }));
    expect(firstStream.stop).toHaveBeenCalledTimes(1);
    expect(closePort).toHaveBeenCalledTimes(1);

    const firstRoot = root!;
    root = createRoot(document.createElement('div'));
    const second = mountHook(useWavAudioRecorder, { onComplete: vi.fn(), onOtherError });
    const starts: Promise<void>[] = [];
    try {
      await act(async () => {
        starts.push(first.current.startRecording(), second.current.startRecording());
        await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(2));
      });
      expect(connect).toHaveBeenCalledTimes(2);
      expect(Recorder.instances).toHaveLength(0);
      await act(async () => {
        registration.resolve();
        await Promise.all(starts);
      });
      expect(Recorder.instances).toHaveLength(2);
    } finally {
      act(() => firstRoot.unmount());
    }
  });

  it('routes permission and device errors separately and cleans up on recorder errors', async () => {
    const { stream, stop } = streamWithTrack();
    const onNoPermissionError = vi.fn();
    const onNotSupportedError = vi.fn();
    const onOtherError = vi.fn();
    const onComplete = vi.fn();
    const hook = mountHook(useWavAudioRecorder, {
      onComplete, onNoPermissionError, onNotSupportedError, onOtherError,
    });
    vi.stubGlobal('navigator', {});
    await act(async () => hook.current.startRecording());
    expect(onNotSupportedError).toHaveBeenCalledTimes(1);
    expect(onNoPermissionError).not.toHaveBeenCalled();

    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
      .mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'))
      .mockResolvedValue(stream);
    await act(async () => hook.current.startRecording());
    await act(async () => hook.current.startRecording());
    expect(onNoPermissionError).toHaveBeenCalledTimes(1);
    expect(onOtherError).toHaveBeenCalledWith(expect.objectContaining({ message: 'missing' }));

    await act(async () => hook.current.startRecording());
    const recorder = Recorder.instances[0];
    act(() => recorder.dispatchEvent(new ErrorEvent('error', { error: new Error('recorder failed') })));
    expect(hook.current.recording).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(onOtherError).toHaveBeenCalledWith(expect.objectContaining({ message: 'recorder failed' }));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ignores the first permission request after Strict Mode replays mount effects', async () => {
    const first = deferred<MediaStream>();
    const discarded = streamWithTrack();
    const retained = streamWithTrack();
    getUserMedia.mockReturnValueOnce(first.promise).mockResolvedValueOnce(retained.stream);
    const onOtherError = vi.fn();
    function Probe() {
      const { startRecording } = useWavAudioRecorder({ onComplete: vi.fn(), onOtherError });
      useEffect(() => { void startRecording(); }, [startRecording]);
      return null;
    }

    await act(async () => {
      root?.render(<StrictMode><Probe /></StrictMode>);
    });
    await act(async () => { first.resolve(discarded.stream); });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(Recorder.instances).toHaveLength(1);
    expect(discarded.stop).toHaveBeenCalledTimes(1);
    expect(retained.stop).not.toHaveBeenCalled();
    expect(onOtherError).not.toHaveBeenCalled();
    unmount();
    expect(retained.stop).toHaveBeenCalledTimes(1);
  });

  it('releases the microphone after constructor failure or unmount during a pending request', async () => {
    const failing = streamWithTrack();
    const pending = deferred<MediaStream>();
    const cancelled = streamWithTrack();
    getUserMedia.mockResolvedValueOnce(failing.stream).mockReturnValueOnce(pending.promise);
    Recorder.construct.mockImplementationOnce(() => { throw new Error('constructor failed'); });
    const onOtherError = vi.fn();
    const hook = mountHook(useWavAudioRecorder, { onComplete: vi.fn(), onOtherError });
    await act(async () => hook.current.startRecording());
    expect(failing.stop).toHaveBeenCalledTimes(1);
    expect(onOtherError).toHaveBeenCalledTimes(1);
    const start = hook.current.startRecording();
    unmount();
    pending.resolve(cancelled.stream);
    await start;
    expect(cancelled.stop).toHaveBeenCalledTimes(1);
    expect(Recorder.instances).toHaveLength(0);
  });
});

describe('useWavToMp3Worker', () => {
  const wav = new Blob(['wav']);
  const mp3 = new Blob(['mp3'], { type: 'audio/mp3' });

  it('rejects same-tick duplicates, delivers to the latest callback, and can immediately retry', async () => {
    const original = vi.fn();
    const latest = vi.fn();
    const hook = mountHook(useWavToMp3Worker, { onComplete: original });
    let first!: Promise<void>;
    let duplicate!: Promise<void>;
    act(() => {
      first = hook.current.convert(wav);
      duplicate = hook.current.convert(wav);
    });
    await expect(duplicate).rejects.toThrow('already in progress');
    expect(hook.current.inProgress).toBe(true);
    expect(Worker.instances).toHaveLength(1);
    hook.render({ onComplete: latest });
    const worker = Worker.instances[0];
    await act(async () => {
      worker.reply({ ok: true, blob: mp3 });
      worker.reply({ ok: true, blob: mp3 });
      await first;
    });
    expect(original).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest).toHaveBeenCalledWith(mp3);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(hook.current.inProgress).toBe(false);

    await act(async () => {
      const second = hook.current.convert(wav);
      Worker.instances[1].reply({ ok: true, blob: mp3 });
      await second;
    });
    expect(latest).toHaveBeenCalledTimes(2);
  });

  const failures: [string, (worker: Worker) => void, string][] = [
    ['worker error', (worker) => worker.dispatchEvent(new ErrorEvent('error', { message: 'crash' })), 'crash'],
    ['message error', (worker) => worker.dispatchEvent(new Event('messageerror')), 'could not be decoded'],
    ['invalid response', (worker) => worker.reply(null), 'invalid reply'],
    ['conversion error', (worker) => worker.reply({ ok: false, message: 'Invalid WAV' }), 'Invalid WAV'],
    ['timeout', () => vi.advanceTimersByTime(60_000), 'timed out'],
  ];

  it.each(failures)('cleans up after %s and accepts a retry', async (_, fail, message) => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const onComplete = vi.fn();
    const hook = mountHook(useWavToMp3Worker, { onComplete, onError });
    await act(async () => {
      const pending = hook.current.convert(wav);
      fail(Worker.instances[0]);
      await pending;
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain(message);
    expect(Worker.instances[0].terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(hook.current.inProgress).toBe(false);
    await act(async () => {
      const retry = hook.current.convert(wav);
      Worker.instances[1].reply({ ok: true, blob: mp3 });
      await retry;
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(mp3);
  });

  it('reports construction and post failures and cancels a later job on unmount', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const hook = mountHook(useWavToMp3Worker, { onComplete, onError });
    Worker.construct.mockImplementationOnce(() => { throw new Error('construction failed'); });
    await act(async () => hook.current.convert(wav));
    Worker.post.mockImplementationOnce(() => { throw new Error('post failed'); });
    await act(async () => hook.current.convert(wav));
    expect(onError.mock.calls.map(([error]) => error.message)).toEqual(['construction failed', 'post failed']);
    expect(Worker.instances[0].terminate).toHaveBeenCalledTimes(1);

    let pending!: Promise<void>;
    act(() => { pending = hook.current.convert(wav); });
    unmount();
    Worker.instances[1].reply({ ok: true, blob: mp3 });
    await pending;
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(Worker.instances[1].terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
