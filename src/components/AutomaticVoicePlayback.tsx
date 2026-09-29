import { useEffect, useRef, useState } from 'react';

interface Props {
  streamUrl?: string;
  segments?: string[];
  enabled: boolean;
  autoPlay?: boolean;
  complete?: boolean;
  audioContext?: AudioContext | null;
  recoverStream?: () => Promise<string>;
  onStarted?: () => void;
  onFinished?: () => void;
  onError: () => void;
}

export default function AutomaticVoicePlayback({
  streamUrl,
  segments = [],
  enabled,
  autoPlay,
  complete = false,
  audioContext,
  recoverStream,
  onStarted,
  onFinished,
  onError,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const requestedRef = useRef(Boolean(autoPlay));
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const failedRef = useRef(false);
  const callbacksRef = useRef({ onStarted, onFinished, onError, recoverStream });
  const mountedRef = useRef(false);
  const recoveringRef = useRef(false);
  const recoveredRef = useRef(false);
  const [recoveredSource, setRecoveredSource] = useState('');
  const [streamEnded, setStreamEnded] = useState(false);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const playingStream = Boolean(streamUrl && !streamEnded);
  const source = playingStream ? recoveredSource || streamUrl : segments[segmentIndex];
  const nextSource = segments[playingStream ? 0 : segmentIndex + 1];

  useEffect(() => {
    callbacksRef.current = { onStarted, onFinished, onError, recoverStream };
  }, [onStarted, onFinished, onError, recoverStream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function reportFailure() {
    if (failedRef.current || !mountedRef.current) return;
    failedRef.current = true;
    callbacksRef.current.onError();
  }

  function reportFinished() {
    if (finishedRef.current || failedRef.current || !mountedRef.current) return;
    finishedRef.current = true;
    callbacksRef.current.onFinished?.();
  }

  function recoverOrFail() {
    if (recoveringRef.current || failedRef.current) return;
    const recover = callbacksRef.current.recoverStream;
    if (!playingStream || recoveredRef.current || !recover) {
      reportFailure();
      return;
    }
    recoveringRef.current = true;
    recoveredRef.current = true;
    void recover().then(url => {
      if (!url) throw new Error('Character TTS response has no audio URL');
      if (mountedRef.current) setRecoveredSource(url);
    }).catch(reportFailure).finally(() => {
      recoveringRef.current = false;
    });
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source || !enabled || !requestedRef.current || failedRef.current) return;
    let cancelled = false;
    let blocked = false;
    let pending = false;
    let bufferSource: AudioBufferSourceNode | null = null;
    let bufferPending = false;
    let usingBuffer = false;
    const controller = new AbortController();

    const reportStarted = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      callbacksRef.current.onStarted?.();
    };

    // The send gesture unlocks this context, not newly mounted media elements.
    const playDecodedAudio = async () => {
      if (!audioContext || audioContext.state !== 'running' || bufferPending || usingBuffer) return;
      bufferPending = true;
      try {
        const response = await fetch(source, { credentials: 'include', signal: controller.signal });
        if (!response.ok) throw new Error(`Character audio request failed (${response.status})`);
        const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
        if (cancelled) return;
        bufferSource = audioContext.createBufferSource();
        bufferSource.buffer = buffer;
        bufferSource.connect(audioContext.destination);
        bufferSource.onended = () => {
          if (cancelled) return;
          if (playingStream) {
            setStreamEnded(true);
          } else {
            setSegmentIndex(index => index + 1);
          }
        };
        usingBuffer = true;
        blocked = false;
        audio.pause();
        bufferSource.start();
        reportStarted();
      } catch {
        if (!cancelled) recoverOrFail();
      } finally {
        bufferPending = false;
      }
    };

    const play = () => {
      if (cancelled || pending || bufferPending || usingBuffer || recoveringRef.current) return;
      pending = true;
      void audio.play().then(() => {
        if (cancelled) return;
        blocked = false;
        if (!startedRef.current) {
          startedRef.current = true;
          callbacksRef.current.onStarted?.();
        }
      }).catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          blocked = true;
          void playDecodedAudio();
        } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
          recoverOrFail();
        }
      }).finally(() => {
        pending = false;
      });
    };
    const retry = () => {
      if (blocked && !failedRef.current) play();
    };

    play();
    // Retry policy-blocked playback on a normal chat interaction, without controls.
    document.addEventListener('pointerdown', retry);
    document.addEventListener('keydown', retry);
    return () => {
      cancelled = true;
      controller.abort();
      if (bufferSource) {
        bufferSource.onended = null;
        bufferSource.stop();
        bufferSource.disconnect();
      }
      audio.pause();
      document.removeEventListener('pointerdown', retry);
      document.removeEventListener('keydown', retry);
    };
  }, [enabled, source, audioContext, playingStream, segmentIndex]);

  useEffect(() => {
    if (!complete || !requestedRef.current || failedRef.current) return;
    if (playingStream || source || segmentIndex < segments.length) return;
    reportFinished();
  }, [complete, playingStream, source, segmentIndex, segments.length]);

  return (
    <>
      <audio
        ref={audioRef}
        hidden
        aria-hidden="true"
        preload={requestedRef.current ? 'auto' : 'none'}
        crossOrigin="use-credentials"
        src={requestedRef.current ? source : undefined}
        onEnded={() => {
          if (playingStream) setStreamEnded(true);
          else setSegmentIndex(index => index + 1);
        }}
        onError={() => {
          if (!source || failedRef.current) return;
          recoverOrFail();
        }}
      />
      {requestedRef.current && nextSource && (
        <audio hidden aria-hidden="true" preload="auto" crossOrigin="use-credentials" src={nextSource} />
      )}
    </>
  );
}
