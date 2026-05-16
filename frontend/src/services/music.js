// Mood-based ambient synth using Web Audio API.
// Tüm mood ID'leri MoodContext.jsx ile birebir eşleştirildi.

const MOOD_PRESETS = {
  // 🛋️ Battaniye Modu — Sıcak, huzurlu Lo-Fi
  battaniye: {
    label: "Sıcak Pikap",
    notes: [261.63, 329.63, 392.00, 523.25],
    wave: "triangle",
    filterFreq: 1800, filterQ: 0.6,
    detune: 5, lfoRate: 0.10, lfoDepth: 3,
    gain: 0.14, color: "#b45309"
  },
  // 🧳 Yolculuk Ruhu — Açık hava, indie folk
  yolculuk: {
    label: "Ufuk Çizgisi",
    notes: [293.66, 349.23, 440.00, 587.33],
    wave: "triangle",
    filterFreq: 2200, filterQ: 0.7,
    detune: 7, lfoRate: 0.14, lfoDepth: 5,
    gain: 0.13, color: "#0c4a6e"
  },
  // 🌙 Gece Kuşu — Synthwave karanlık
  gece: {
    label: "Gece Frekansı",
    notes: [110.00, 138.59, 164.81, 220.00],
    wave: "sawtooth",
    filterFreq: 900, filterQ: 2.5,
    detune: 9, lfoRate: 0.06, lfoDepth: 120,
    gain: 0.11, color: "#4c1d95"
  },
  // 😂 Kahkaha Molası — Neşeli, upbeat funk
  kahkaha: {
    label: "Mutlu Sapak",
    notes: [392.00, 493.88, 587.33, 698.46],
    wave: "triangle",
    filterFreq: 3500, filterQ: 0.5,
    detune: 4, lfoRate: 0.28, lfoDepth: 6,
    gain: 0.16, color: "#065f46"
  },
  // 🍷 Gözyaşı Gecesi — Neoclassical cello, derin hüzün
  gozyasi: {
    label: "Sahnenin Sessizliği",
    notes: [73.42, 110.00, 146.83, 196.00],
    wave: "sine",
    filterFreq: 600, filterQ: 1.5,
    detune: 2, lfoRate: 0.05, lfoDepth: 90,
    gain: 0.19, color: "#1e293b"
  },
  // 🔥 Adrenalin Patlaması — Industrial, sinematik gerilim
  adrenalin: {
    label: "Kalp Pili",
    notes: [146.83, 185.00, 233.08, 293.66],
    wave: "sawtooth",
    filterFreq: 1400, filterQ: 3.5,
    detune: 12, lfoRate: 0.35, lfoDepth: 300,
    gain: 0.12, color: "#7f1d1d"
  },
  // 💐 Aşk Bahçesi — Fransız chanson, yumuşak
  askbahcesi: {
    label: "Yasemin Saati",
    notes: [329.63, 415.30, 493.88, 622.25],
    wave: "sine",
    filterFreq: 2800, filterQ: 0.8,
    detune: 3, lfoRate: 0.12, lfoDepth: 8,
    gain: 0.13, color: "#831843"
  },
  // 📽️ Zaman Yolcusu — Vintage jazz, gramofon
  zamanyolcusu: {
    label: "Nostaljik Ritim",
    notes: [196.00, 246.94, 293.66, 392.00],
    wave: "triangle",
    filterFreq: 1200, filterQ: 1.2,
    detune: 6, lfoRate: 0.09, lfoDepth: 20,
    gain: 0.15, color: "#78350f"
  },
  // 🔇 Sessiz Yolculuk — Minimalist ambient
  sessiz: {
    label: "Cam Ardı",
    notes: [220.00, 277.18, 329.63, 440.00],
    wave: "sine",
    filterFreq: 700, filterQ: 0.9,
    detune: 1, lfoRate: 0.04, lfoDepth: 40,
    gain: 0.10, color: "#18181b"
  },
  // 🧠 Zihin Savaşı — Cinematic tension
  zihin: {
    label: "Karanlık Koridor",
    notes: [123.47, 155.56, 196.00, 246.94],
    wave: "sawtooth",
    filterFreq: 800, filterQ: 4,
    detune: 8, lfoRate: 0.15, lfoDepth: 250,
    gain: 0.11, color: "#312e81"
  },
  // 💓 Kalbimin Sesi — Duygusal indie
  kalp: {
    label: "İnce Çizgi",
    notes: [261.63, 311.13, 392.00, 493.88],
    wave: "sine",
    filterFreq: 1600, filterQ: 0.7,
    detune: 3, lfoRate: 0.08, lfoDepth: 15,
    gain: 0.14, color: "#9f1239"
  },
  // 🌀 Karmaşakar — Surreal/experimental
  karmakar: {
    label: "Rüya Frekansı",
    notes: [164.81, 207.65, 261.63, 329.63],
    wave: "sawtooth",
    filterFreq: 1100, filterQ: 3.0,
    detune: 15, lfoRate: 0.20, lfoDepth: 180,
    gain: 0.11, color: "#3b0764"
  },
  // 📺 Retro Bakış — 80s synthwave neon
  Retro: {
    label: "Neon Sokak",
    notes: [233.08, 293.66, 349.23, 466.16],
    wave: "sawtooth",
    filterFreq: 2000, filterQ: 1.5,
    detune: 10, lfoRate: 0.22, lfoDepth: 160,
    gain: 0.12, color: "#155e75"
  },
  // 🕯️ Derin Ürperti — Dark ambient, sisli atmosfer
  "deep-chills": {
    label: "Tekinsiz Fısıltı",
    notes: [55.00, 73.42, 98.00, 130.81],
    wave: "sine",
    filterFreq: 400, filterQ: 2.0,
    detune: 4, lfoRate: 0.03, lfoDepth: 60,
    gain: 0.17, color: "#082f49"
  },
};

class MoodSynth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.activeNodes = [];
    this.currentMood = null;
    this.targetGain = parseFloat(localStorage.getItem("music-volume") || "0.6");
    this.muted = false;
    this.listeners = new Set();
  }

  _ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
    }
    // Kritik: Tarayıcı ses politikası — kullanıcı tıklamasından sonra resume çağrılmalı
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  _emit() {
    const snap = { mood: this.currentMood, playing: !!this.currentMood && !this.muted, volume: this.targetGain };
    this.listeners.forEach(l => l(snap));
  }

  on(fn) {
    this.listeners.add(fn);
    fn({ mood: this.currentMood, playing: !!this.currentMood && !this.muted, volume: this.targetGain });
    return () => this.listeners.delete(fn);
  }

  setVolume(v) {
    this.targetGain = Math.max(0, Math.min(1, v));
    localStorage.setItem("music-volume", String(this.targetGain));
    if (this.master && this.currentMood && !this.muted) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(this.targetGain, this.ctx.currentTime + 0.4);
    }
    this._emit();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(m ? 0 : this.targetGain, this.ctx.currentTime + 0.3);
    }
    this._emit();
  }

  // Kullanıcı tıklamasında çağrılmalı (tarayıcı politikası gereği)
  play(moodId) {
    const preset = MOOD_PRESETS[moodId];
    if (!preset) {
      console.warn(`[MoodSynth] Preset bulunamadı: "${moodId}". Mevcut: ${Object.keys(MOOD_PRESETS).join(', ')}`);
      return;
    }
    // AudioContext'i kullanıcı tıklama anında başlat/devam ettir
    this._ensureCtx();
    if (this.currentMood === moodId && !this.muted) return;

    // 2 saniyelik crossfade: eski sesi kapat, yeni sesi aç
    this._fadeOutAndKill(2.0);

    setTimeout(() => {
      const ctx = this.ctx;
      const localNodes = [];
      preset.notes.forEach((freq, i) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = preset.wave;
        osc2.type = preset.wave;
        osc1.frequency.value = freq;
        osc2.frequency.value = freq;
        osc2.detune.value = preset.detune;

        const gain = ctx.createGain();
        gain.gain.value = 0;
        // 2 saniyelik fade-in
        gain.gain.linearRampToValueAtTime(
          preset.gain * (0.7 + Math.random() * 0.3),
          ctx.currentTime + 2 + i * 0.3
        );

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = preset.filterFreq;
        filter.Q.value = preset.filterQ;

        const lfo = ctx.createOscillator();
        lfo.frequency.value = preset.lfoRate + Math.random() * 0.04;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = preset.lfoDepth;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);

        osc1.start(); osc2.start(); lfo.start();
        localNodes.push(osc1, osc2, lfo, gain, filter, lfoGain);
      });

      this.activeNodes = localNodes;
      this.currentMood = moodId;
      this.muted = false;

      // Master fade-in: 2 saniye
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(this.targetGain, ctx.currentTime + 2.0);
      this._emit();
    }, 2100); // fade-out bitiminden sonra başlat
  }

  _fadeOutAndKill(seconds) {
    if (!this.master || !this.ctx) return;
    const ctx = this.ctx;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds);
    const dead = this.activeNodes;
    this.activeNodes = [];
    setTimeout(() => {
      dead.forEach(n => {
        try { n.stop && n.stop(); } catch(e) {}
        try { n.disconnect(); } catch(e) {}
      });
    }, seconds * 1000 + 100);
  }

  stop() {
    this._fadeOutAndKill(2.0);
    this.currentMood = null;
    this._emit();
  }
}

export const moodSynth = new MoodSynth();
export { MOOD_PRESETS };
