let currentAudio = null;
let currentMoodId = null;
let transitionId = 0;
let targetVolume = 0.35;

// Premium crossfade settings
const fadeDurationMs = 600; // Faster, snappier fade
const preloadedAudios = new Map();

// Doğrudan CDN URL'leri — backend proxy gereksiz, browser direkt çalar
const MOOD_AUDIO_DIRECT = {
  "battaniye":    "https://cdn.pixabay.com/audio/2024/09/10/audio_6e5d7d1db1.mp3",
  "yolculuk":     "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3",
  "gece":         "https://cdn.pixabay.com/audio/2023/07/07/audio_34cea2adf1.mp3",
  "kahkaha":      "https://cdn.pixabay.com/audio/2024/09/24/audio_8e1f0ab42a.mp3",
  "gozyasi":      "https://cdn.pixabay.com/audio/2023/10/02/audio_3bbf037e6a.mp3",
  "adrenalin":    "https://cdn.pixabay.com/audio/2022/10/09/audio_39e0e70bca.mp3",
  "askbahcesi":   "https://cdn.pixabay.com/audio/2023/09/06/audio_13fae70fd0.mp3",
  "zamanyolcusu": "https://cdn.pixabay.com/audio/2022/02/22/audio_d1718ab41b.mp3",
  "sessiz":       "https://cdn.pixabay.com/audio/2022/10/25/audio_1e6d7b7e42.mp3",
  "zihin":        "https://cdn.pixabay.com/audio/2022/03/09/audio_65a70e1ef3.mp3",
  "kalp":         "https://cdn.pixabay.com/audio/2023/06/12/audio_ba5e3a3f59.mp3",
  "karmakar":     "https://cdn.pixabay.com/audio/2022/08/02/audio_8c8b08c8c4.mp3",
  "retro":        "https://cdn.pixabay.com/audio/2022/11/22/audio_8ceabc8b8e.mp3",
  "deep-chills":  "https://cdn.pixabay.com/audio/2023/07/07/audio_34cea2adf1.mp3",
};

/**
 * Normalizes mood ID for audio lookup.
 */
function normalizeMoodId(moodId) {
  if (!moodId) return "";
  return moodId.trim().toLowerCase();
}

function getMoodAudioUrl(moodId) {
  const normalized = normalizeMoodId(moodId);
  return MOOD_AUDIO_DIRECT[normalized] || null;
}

/**
 * Preloads audio for a specific mood to speed up playback.
 */
export function preloadMoodAudio(moodId) {
  const normalized = normalizeMoodId(moodId);
  const url = getMoodAudioUrl(normalized);
  if (!normalized || !url || preloadedAudios.has(normalized)) return;

  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
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
  if (!normalizedMoodId || !getMoodAudioUrl(normalizedMoodId)) return;

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
    audio.src = getMoodAudioUrl(normalizedMoodId) || '';
  }

  audio.loop = true;
  audio.volume = 0;
  audio.muted = false;
  audio.preload = "auto";
  // crossOrigin "anonymous" kaldırıldı — Pixabay CDN CORS header dönmüyor,
  // anonymous mode ile audio bloklanıyordu.

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
