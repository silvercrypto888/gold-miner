"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// Tracks discovered by lazy HEAD probes
const TRACK_CANDIDATES = [
  "/assets/music/Cognitive Dissonance.opus",
  "/assets/music/Op.72_No.2.opus",
  "/assets/music/Pinball Spring.opus",
  "/assets/music/The_Planets_Op.32_Jupiter_The_Bringer_of_Jollity_Mix_USAF_and_NYCP.opus",
];

const SOUND_CANDIDATES: Record<string, string> = {
  mine: "/assets/sounds/gold_mine.opus",
  walk: "/assets/sounds/walk.opus",
  enter_foresight: "/assets/sounds/enter_foresight.opus",
  exit_foresight: "/assets/sounds/exit_foresight.opus",
  winter_wind: "/assets/sounds/winter-wind.opus",
  bell: "/assets/sounds/bell.opus",
  angelical_pad: "/assets/sounds/angelical-pad.opus",
  cinematic_boom: "/assets/sounds/cinematic-boom.opus",
};

export function useAudio() {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const trackListRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  // Sound cache — lazy, only creates Audio on first play
  const soundCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const getSound = useCallback((url: string): HTMLAudioElement => {
    let audio = soundCacheRef.current.get(url);
    if (!audio) {
      audio = new Audio(url);
      audio.preload = "none";
      soundCacheRef.current.set(url, audio);
    }
    return audio;
  }, []);

  // Discover existing tracks — HEAD probes are cheap (just headers, not body)
  // but we cache the result so it only runs once per session
  const discoverTracks = useCallback(async () => {
    const cached = sessionStorage.getItem("goldminer_tracks");
    if (cached) {
      trackListRef.current = JSON.parse(cached);
      return trackListRef.current;
    }
    const found: string[] = [];
    const promises = TRACK_CANDIDATES.map(url =>
      fetch(url, { method: "HEAD" })
        .then(r => { if (r.ok) found.push(url); })
        .catch(() => {})
    );
    await Promise.all(promises);
    trackListRef.current = found;
    try { sessionStorage.setItem("goldminer_tracks", JSON.stringify(found)); } catch {}
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
      if (next) {
        // Resume or restart — discoverTracks is near-instant via sessionStorage cache
        if (musicRef.current) {
          musicRef.current.play().catch(() => {});
        } else {
          discoverTracks().then(tracks => {
            if (tracks.length > 0) playNextTrack(currentIndexRef.current);
          });
        }
      } else if (musicRef.current) {
        musicRef.current.pause();
        // Keep the element alive so we can resume later
        // (but we still pause & null out because the track may have ended)
        musicRef.current = null;
      }
      return next;
    });
  }, [discoverTracks, playNextTrack]);

  const playSound = useCallback(
    (name: "mine" | "walk" | "enter_foresight" | "exit_foresight" | "winter_wind" | "bell" | "angelical_pad" | "cinematic_boom") => {
      if (!soundEnabled) return;
      const url = SOUND_CANDIDATES[name];
      if (!url) return;

      const audio = getSound(url);
      audio.currentTime = 0;
      audio.play().catch(() => {});
    },
    [soundEnabled, getSound]
  );

  return {
    soundEnabled,
    musicEnabled,
    toggleSound,
    toggleMusic,
    playSound,
  };
}
