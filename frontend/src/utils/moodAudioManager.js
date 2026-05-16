import { API_BASE_URL } from './apiConfig';

let currentAudio = null;
let currentMoodId = null;
let transitionId = 0;
let targetVolume = 0.35;

// Premium crossfade settings
const fadeDurationMs = 600; // Faster, snappier fade
const preloadedAudios = new Map();

/**
 * Normalizes mood ID for backend compatibility.
 */
function normalizeMoodId(moodId) {
  if (!moodId) return "";
  const m = moodId.trim();
  if (m.toLowerCase() === "retro") return "Retro";
  return m.toLowerCase();
}

function getMoodAudioUrl(moodId) {
  const normalized = normalizeMoodId(moodId);
  return `${API_BASE_URL}/api/audio/${encodeURIComponent(normalized)}`;
}

/**
 * Preloads audio for a specific mood to speed up playback.
 */
export function preloadMoodAudio(moodId) {
  const normalized = normalizeMoodId(moodId);
  if (!normalized || preloadedAudios.has(normalized)) return;

  const audio = new Audio();
  audio.preload = "auto";
  audio.src = getMoodAudioUrl(normalized);
  audio.volume = 0;
  preloadedAudios.set(normalized, audio);
  console.log("[MoodAudioPreload] Preloading:", normalized);
}

/**
 * Smoothly transitions volume of an audio element.
 */
function fadeAudio(audio, from, to, durationMs, token) {
  return new Promise((resolve) => {
    const steps = 15;
    const stepTime = durationMs / steps;
    let step = 0;

    audio.volume = from;

    const interval = setInterval(() => {
      if (token !== transitionId) {
        clearInterval(interval);
        try { audio.volume = to; } catch (e) {}
        resolve(false);
        return;
      }

      step += 1;
      const ratio = Math.min(step / steps, 1);
      audio.volume = from + (to - from) * ratio;

      if (ratio >= 1) {
        clearInterval(interval);
        resolve(true);
      }
    }, stepTime);
  });
}

/**
 * Plays audio for a specific mood with fade-in and previous track fade-out.
 */
export async function playMoodAudio(moodId) {
  const normalizedMoodId = normalizeMoodId(moodId);
  if (!normalizedMoodId) return;

  if (currentAudio && currentMoodId === normalizedMoodId && !currentAudio.paused) {
    return;
  }

  transitionId += 1;
  const token = transitionId;

  // 1. Handle old audio — immediately stop to prevent overlap
  if (currentAudio) {
    const oldAudio = currentAudio;
    currentAudio = null;
    currentMoodId = null;
    try {
      oldAudio.pause();
      oldAudio.currentTime = 0;
      oldAudio.volume = 0;
    } catch (e) {}
  }

  // 2. Setup new audio (Check preload cache first)
  let audio;
  if (preloadedAudios.has(normalizedMoodId)) {
    console.log("[MoodAudio] Using preloaded instance for:", normalizedMoodId);
    audio = preloadedAudios.get(normalizedMoodId);
    preloadedAudios.delete(normalizedMoodId); // Move out of preloaded cache
  } else {
    audio = new Audio();
    audio.src = getMoodAudioUrl(normalizedMoodId);
  }

  audio.loop = true;
  audio.volume = 0;
  audio.muted = false;
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";

  currentAudio = audio;
  currentMoodId = normalizedMoodId;

  try {
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      await playPromise;
      if (token !== transitionId) {
        audio.pause();
        return;
      }
      await fadeAudio(audio, 0, targetVolume, fadeDurationMs, token);
    }
  } catch (err) {
    console.error("[MoodAudio] Playback blocked:", err);
  }
}

export async function stopMoodAudio() {
  transitionId += 1;
  const token = transitionId;
  if (!currentAudio) return;

  const audio = currentAudio;
  currentAudio = null;
  currentMoodId = null;

  try {
    await fadeAudio(audio, audio.volume, 0, 800, token); // Slower fade for exit
  } catch (err) {}

  // Always pause regardless of whether fade completed or was cancelled
  try { audio.pause(); audio.currentTime = 0; } catch (e) {}
}

export function setMoodAudioVolume(volume) {
  targetVolume = Math.max(0, Math.min(volume, 1));
  if (currentAudio) {
    currentAudio.volume = targetVolume;
  }
}

export function getCurrentMoodAudio() {
  return {
    moodId: currentMoodId,
    isPlaying: !!currentAudio && !currentAudio.paused,
    volume: currentAudio ? currentAudio.volume : 0,
    src: currentAudio ? currentAudio.src : null,
  };
}
