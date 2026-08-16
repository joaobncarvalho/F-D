// Efeitos sonoros sintetizados (Web Audio) — sem ficheiros externos.
// O AudioContext só é criado no primeiro gesto do utilizador (política de autoplay).

let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('fd_muted') === '1';
} catch {
  muted = false;
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Toca um tom simples. */
function tone(freq, dur = 0.12, type = 'sine', gain = 0.14, when = 0) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + when;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function slide(from, to, dur = 0.25, type = 'sawtooth', gain = 0.12) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  isMuted: () => muted,
  toggleMute() {
    muted = !muted;
    try {
      localStorage.setItem('fd_muted', muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!muted) tone(660, 0.08, 'triangle');
    return muted;
  },
  // Desperta o AudioContext num gesto do utilizador.
  unlock() {
    ac();
  },
  click: () => tone(520, 0.06, 'triangle', 0.1),
  join: () => {
    tone(523, 0.1, 'sine');
    tone(784, 0.12, 'sine', 0.12, 0.09);
  },
  spin: () => slide(220, 900, 0.6, 'sawtooth', 0.1),
  reveal: () => {
    tone(660, 0.1, 'triangle');
    tone(880, 0.14, 'triangle', 0.12, 0.1);
  },
  drink: () => slide(400, 160, 0.3, 'sawtooth', 0.14),
  shot: () => {
    slide(300, 80, 0.45, 'square', 0.16);
    tone(120, 0.3, 'sawtooth', 0.12, 0.05);
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.14, i * 0.12));
  },
};
