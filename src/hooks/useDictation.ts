import { useCallback, useEffect, useRef, useState } from 'react';

// The browser's speech recogniser (Chrome / Samsung Internet / Edge). TypeScript ships its
// events but not the recogniser itself.
type Recogniser = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecogniserCtor = new () => Recogniser;

function recogniser(): RecogniserCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecogniserCtor; webkitSpeechRecognition?: RecogniserCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const dictationSupported = typeof window !== 'undefined' && !!recogniser();

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is off for YOUrigin — allow it in the browser’s site settings',
  'service-not-allowed': 'Speech typing isn’t available in this browser',
  'audio-capture': 'No microphone found',
  network: 'Speech typing needs a connection',
};

/**
 * Speak and the words arrive as text. `onFinal` gets each finished phrase; the phrase
 * still being heard is in `interim`. Most phones send the audio to their speech service,
 * so this needs a connection.
 */
export function useDictation(onFinal: (phrase: string) => void, onError: (message: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const rec = useRef<Recogniser | null>(null);
  const handlers = useRef({ onFinal, onError });
  handlers.current = { onFinal, onError };

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recogniser();
    if (!Ctor || rec.current) return;
    const r = new Ctor();
    r.lang = navigator.language || 'en-GB';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let pending = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) handlers.current.onFinal(res[0].transcript.trim());
        else pending += res[0].transcript;
      }
      setInterim(pending.trim());
    };
    r.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') handlers.current.onError(ERRORS[e.error] ?? 'Speech typing stopped');
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      setInterim('');
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      rec.current = null;
      handlers.current.onError('Speech typing couldn’t start');
    }
  }, []);

  useEffect(() => () => rec.current?.stop(), []);

  return { listening, interim, start, stop };
}
