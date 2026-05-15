"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// Tracks discovered by lazy HEAD probes
const TRACK_CANDIDATES = [
  "/assets/music/Cognitive Dissonance.opus",
  "/assets/music/Op.72_No.2.opus",
  "/assets/music/Pinball Spring.opus",
];

const SOUND_CANDIDATES: Record<string, string> = {
  mine: "/assets/sounds/gold_mine.opus",
  walk: "/assets/sounds/walk.opus",
};

export function useAudio() {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const trackListRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const musicInitRef = useRef(false);
  const soundCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Discover existing tracks
  const discoverTracks = useCallback(async () => {
    const found: string[] = [];
    const promises = TRACK_CANDIDATES.map(url =>
      fetch(url, { method: "HEAD" })
        .then(r => { if (r.ok) found.push(url); })
        .catch(() => {})
    );
    await Promise.all(promises);
    trackListRef.current = found;
    return found;
  }, []);

  const playNextTrack = useCallback((index: number) => {
    const tracks = trackListRef.current;
    if (tracks.length === 0) return;

    const idx = ((index % tracks.length) + tracks.length) % tracks.length;
    currentIndexRef.current = idx;

    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current = null;
    }

    const audio = new Audio(tracks[idx]);
    audio.preload = "none";
    audio.volume = 0.4;
    audio.addEventListener("ended", () => playNextTrack(idx + 1));
    audio.load();
    audio.play().catch(() => {});

    musicRef.current = audio;
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => !prev);
  }, []);

  const toggleMusic = useCallback(() => {
    setMusicEnabled(prev => {
      const next = !prev;
      if (next && !musicInitRef.current) {
        musicInitRef.current = true;
        discoverTracks().then(tracks => {
          if (tracks.length > 0) playNextTrack(0);
        });
      } else if (!next && musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
      return next;
    });
  }, [discoverTracks, playNextTrack]);

  // Pre-cache sound effects when enabled
  useEffect(() => {
    if (!soundEnabled) return;
    Object.values(SOUND_CANDIDATES).forEach(url => {
      if (!soundCacheRef.current.has(url)) {
        const audio = new Audio(url);
        audio.preload = "auto";
        soundCacheRef.current.set(url, audio);
      }
    });
  }, [soundEnabled]);

  const playSound = useCallback(
    (name: "mine" | "walk") => {
      if (!soundEnabled) return;
      const url = SOUND_CANDIDATES[name];
      if (!url) return;

      // Use cached or create one-shot
      let audio = soundCacheRef.current.get(url);
      if (!audio) {
        audio = new Audio(url);
        soundCacheRef.current.set(url, audio);
      }
      audio.currentTime = 0;
      audio.play().catch(() => {});
    },
    [soundEnabled]
  );

  return {
    soundEnabled,
    musicEnabled,
    toggleSound,
    toggleMusic,
    playSound,
  };
}
