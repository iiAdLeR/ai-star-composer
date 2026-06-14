import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tiny wrapper around the Web Speech API (window.speechSynthesis).
 *
 * Browser-native, fully offline (no network), no API keys. Picks a
 * voice that best matches the requested language tag, falls back to
 * the default voice. Exposes idempotent play / stop and a `speaking`
 * flag the UI can mirror.
 */

export interface SpeakOptions {
  /** "en" or "tr"; matched against voice.lang prefix. */
  lang?: string;
  rate?: number;  // 0.1 .. 10 (default 1)
  pitch?: number; // 0 .. 2  (default 1)
  volume?: number; // 0 .. 1 (default 1)
}

export interface SpeechSynthesisApi {
  supported: boolean;
  speaking: boolean;
  speak: (text: string, opts?: SpeakOptions) => void;
  stop: () => void;
}

function pickVoice(lang: string | undefined): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const want = (lang ?? "en").toLowerCase().slice(0, 2);

  const exact = voices.find((v) => v.lang.toLowerCase().startsWith(want) && v.default);
  if (exact) return exact;
  const any = voices.find((v) => v.lang.toLowerCase().startsWith(want));
  if (any) return any;
  return voices.find((v) => v.default) ?? voices[0] ?? null;
}

export function useSpeechSynthesis(): SpeechSynthesisApi {
  const supported = typeof window !== "undefined" && !!window.speechSynthesis;
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Force voice list to load (some browsers populate asynchronously).
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const tick = () => synth.getVoices();
    tick();
    synth.addEventListener("voiceschanged", tick);
    return () => synth.removeEventListener("voiceschanged", tick);
  }, [supported]);

  // Stop speech if the component unmounts while talking.
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string, opts?: SpeakOptions) => {
      if (!supported || !text.trim()) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(opts?.lang);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else if (opts?.lang) {
        u.lang = opts.lang;
      }
      u.rate = opts?.rate ?? 1;
      u.pitch = opts?.pitch ?? 1;
      u.volume = opts?.volume ?? 1;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      utterRef.current = u;
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  return { supported, speaking, speak, stop };
}
