"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// Tracks discovered by lazy HEAD probes
const TRACK_CANDIDATES = [
  "/assets/music/Cognitive Dissonance.opus",
  "/assets/music/Op.72_No.2.opus",
  "/assets/music/Pinball Spring.opus",
  "/assets/music/The_Planets_Op.32_Jupiter_The_Bringer_of_Jollity_Mix_USAF_and_NYCP.opus",
  "/assets/music/2690_etude-op-10-no-2-chromatique-ba65b02e-a28d-4b0f-be0b-95680122847e.opus",
  "/assets/music/2690_etude-op-10-no-5-black-keys-78597894-e4e5-4bf9-8df4-a611a967dd3e.opus",
  "/assets/music/freesound_community-zapping-5-58125.opus",
  "/assets/music/the_mountain-space-438391.opus",
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
  shine: "/assets/sounds/shine.opus",
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

  // Discover existing tracks by HEAD probing — cheap (no body downloaded),
  // always runs so new files are picked up without a sessionStorage wipe
  const discoverTracks = useCallback(async () => {
    const found: string[] = [];
    await Promise.all(TRACK_CANDIDATES.map(url =>
      fetch(url, { method: "HEAD" })
        .then(r => { if (r.ok) found.push(url); })
        .catch(() => {})
    ));
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

  // Per-sound volume levels (0-1). Defaults to 1 if not listed.
  const SOUND_VOLUMES: Record<string, number> = {
    mine: 0.55,
    enter_foresight: 0.55,
  };

  const playSound = useCallback(
    (name: "mine" | "walk" | "enter_foresight" | "exit_foresight" | "winter_wind" | "bell" | "angelical_pad" | "cinematic_boom") => {
      if (!soundEnabled) return;
      const url = SOUND_CANDIDATES[name];
      if (!url) return;

      const audio = getSound(url);
      audio.currentTime = 0;
      audio.volume = SOUND_VOLUMES[name] ?? 1;
      audio.play().catch(() => {});

      // When mining gold, also play the shine sparkle simultaneously
      if (name === "mine") {
        const shineUrl = SOUND_CANDIDATES["shine"];
        if (shineUrl) {
          const shineAudio = getSound(shineUrl);
          shineAudio.currentTime = 0;
          shineAudio.volume = SOUND_VOLUMES["shine"] ?? 1;
          shineAudio.play().catch(() => {});
        }
      }
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
