let currentAudio = null;
let currentMoodId = null;
let transitionId = 0;
let targetVolume = 0.35;

// Mobil autoplay kilidi: ilk play() bloklanırsa beklemeye al,
// kullanıcının ilk dokunuşunda otomatik başlat.
let pendingMoodId = null;
let unlockBound = false;

function bindAutoUnlock() {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;

  const tryResume = () => {
    // Bekleyen bir mood varsa onu başlat
    if (pendingMoodId) {
      const id = pendingMoodId;
      pendingMoodId = null;
      playMoodAudio(id);
      return;
    }
    // Çalması gerekirken duraklamış ses varsa devam ettir
    if (currentAudio && currentAudio.paused && currentMoodId && targetVolume > 0) {
      currentAudio.play().catch(() => {});
    }
  };

  // Kalıcı dinleyiciler — her dokunuş/tık denesin (gesture içinde çalışır)
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, tryResume, { passive: true, capture: true });
  });
}

// Premium crossfade settings
const fadeDurationMs = 600; // Faster, snappier fade
const preloadedAudios = new Map();

// Vercel CDN'den serve edilen statik ses dosyaları — frontend/public/audio/
const MOOD_AUDIO_DIRECT = {
  "battaniye":    "/audio/battaniye.mp3",
  "yolculuk":     "/audio/yolculuk.mp3",
  "gece":         "/audio/gece.mp3",
  "kahkaha":      "/audio/kahkaha.mp3",
  "gozyasi":      "/audio/gozyasi.mp3",
  "adrenalin":    "/audio/adrenalin.mp3",
  "askbahcesi":   "/audio/askbahcesi.mp3",
  "zamanyolcusu": "/audio/zamanyolcusu.mp3",
  "sessiz":       "/audio/sessiz.mp3",
  "zihin":        "/audio/zihin.mp3",
  "kalp":         "/audio/kalp.mp3",
  "karmakar":     "/audio/karmakar.mp3",
  "sipsak":             "/audio/retro.mp3",        // Indie lo-fi retro — festival kısa filmlerin estetiği
  "deep-chills":        "/audio/deep-chills.mp3",
  "kadraj-estetigi":    "/audio/sessiz.mp3",      // Minimalist piyano & ambient arjeler — görsel şölen için sessiz seyir
  "geceyarisi-itirafi": "/audio/gece.mp3",        // Gece ambiyansı — gece yarısı itiraflarının atmosferi
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

  // İlk çağrıda autoplay kilidi dinleyicilerini kur
  bindAutoUnlock();

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
      pendingMoodId = null; // Başarıyla başladı
      await fadeAudio(audio, 0, targetVolume, fadeDurationMs, token);
    }
  } catch (err) {
    // Mobil autoplay bloğu — bekleyene al, ilk dokunuşta başlasın
    console.warn("[MoodAudio] Autoplay blocked, will resume on first interaction:", err?.name || err);
    pendingMoodId = normalizedMoodId;
  }
}

export async function stopMoodAudio() {
  pendingMoodId = null; // Açıkça durdurulduysa kilit açılınca dirilmesin
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
    // Ses sıfırlandığında gerçekten durdur — sadece sessizleştirme değil
    if (targetVolume === 0 && !currentAudio.paused) {
      currentAudio.pause();
    } else if (targetVolume > 0 && currentAudio.paused && currentMoodId) {
      // Ses tekrar açılınca devam ettir
      currentAudio.play().catch(() => {});
    }
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
