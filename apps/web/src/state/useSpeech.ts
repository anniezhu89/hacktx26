import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechState = "stopped" | "playing" | "paused" | "unavailable";

/**
 * Picks an on-device voice for the language. Network voices (localService
 * false) can send the text to the browser vendor, so they are not used.
 */
export function pickVoice(
  voices: Pick<SpeechSynthesisVoice, "lang" | "localService">[],
  language: "en" | "es",
) {
  return (
    voices.find(
      (v) => v.localService && v.lang.toLowerCase().startsWith(language),
    ) ?? null
  );
}

/** Listen / Pause / Stop with one utterance at a time; never autoplays. */
export function useSpeech(language: "en" | "es") {
  const synth =
    typeof window !== "undefined" && "speechSynthesis" in window
      ? window.speechSynthesis
      : null;
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [state, setState] = useState<SpeechState>(
    synth ? "stopped" : "unavailable",
  );
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!synth) return;
    const load = () => {
      const v = pickVoice(
        synth.getVoices(),
        language,
      ) as SpeechSynthesisVoice | null;
      setVoice(v);
      setState((s) =>
        v ? (s === "unavailable" ? "stopped" : s) : "unavailable",
      );
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, [synth, language]);

  const stop = useCallback(() => {
    current.current = null;
    synth?.cancel();
    setState((s) => (s === "unavailable" ? s : "stopped"));
  }, [synth]);

  // Leaving the page or changing language stops speech.
  useEffect(() => stop, [stop, language]);

  const play = useCallback(
    (text: string) => {
      if (!synth || !voice) return;
      if (state === "paused" && current.current) {
        synth.resume();
        setState("playing");
        return;
      }
      synth.cancel(); // never overlap
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.onend = u.onerror = () => {
        if (current.current === u) {
          current.current = null;
          setState("stopped");
        }
      };
      current.current = u;
      synth.speak(u);
      setState("playing");
    },
    [synth, voice, state],
  );

  const pause = useCallback(() => {
    if (state !== "playing") return;
    synth?.pause();
    setState("paused");
  }, [synth, state]);

  return { state, voiceName: voice?.name ?? null, play, pause, stop };
}
