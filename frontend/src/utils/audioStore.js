/* ═══════════════════════════════════════════════════════════
   audioStore — Module-level store for sharing audio analyser data
   between AudioPlayer and AuraBackground.
   ═══════════════════════════════════════════════════════════ */
const store = {
  analyser: null,
  ctx: null,
  isPlaying: false,
  freqData: new Uint8Array(64).fill(128),
  bass: 0,
  mid: 0,
  treble: 0,
};

export function setAnalyser(analyser, ctx) {
  store.analyser = analyser;
  store.ctx = ctx;
}

export function setPlaying(v) {
  store.isPlaying = v;
}

export function updateFrequencyData() {
  if (!store.analyser || !store.isPlaying) {
    store.bass *= 0.95;
    store.mid *= 0.95;
    store.treble *= 0.95;
    return;
  }
  store.analyser.getByteFrequencyData(store.freqData);
  const d = store.freqData;
  let b = 0, m = 0, t = 0;
  for (let i = 0; i < 64; i++) {
    if (i < 16) b += d[i];
    else if (i < 40) m += d[i];
    else t += d[i];
  }
  store.bass = b / 16 / 255;
  store.mid = m / 24 / 255;
  store.treble = t / 24 / 255;
}

export default store;
