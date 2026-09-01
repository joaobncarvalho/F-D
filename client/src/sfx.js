// Efeitos sonoros sintetizados (Web Audio) — sem ficheiros externos.
// O AudioContext só é criado no primeiro gesto do utilizador (política de autoplay).

let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('fd_muted') === '1';
} catch {
  muted = false;
}

// A música ambiente sai por um barramento próprio para lhe podermos baixar o
// volume ("ducking") sempre que toca um efeito — senão os dois lutam e não se
// percebe nem um nem outro.
let musicGain = null;
let musicNodes = [];
let musicOn = false;
let musicTimer = null;
try {
  musicOn = localStorage.getItem('fd_music') === '1';
} catch {
  musicOn = false;
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const MUSIC_VOL = 0.075;
const DUCK_VOL = 0.02;

/** Baixa a música por instantes para o efeito se ouvir por cima. */
function duck(ms = 420) {
  if (!musicGain || !ctx) return;
  const t = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(musicGain.gain.value, t);
  musicGain.gain.linearRampToValueAtTime(DUCK_VOL, t + 0.05);
  musicGain.gain.linearRampToValueAtTime(MUSIC_VOL, t + ms / 1000);
}

/** Toca um tom simples. */
function tone(freq, dur = 0.12, type = 'sine', gain = 0.14, when = 0) {
  const a = ac();
  if (!a || muted) return;
  duck();
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
  duck();
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
  // Tique curto do timer; `urgent` sobe o tom nos últimos segundos.
  tick: (urgent = false) => tone(urgent ? 880 : 620, 0.05, 'square', urgent ? 0.12 : 0.07),
  // Buzina de tempo esgotado.
  timeout: () => slide(500, 120, 0.4, 'sawtooth', 0.16),

  // ----- Música ambiente -----
  // Um loop simples e sintetizado (baixo + acorde a respirar): o silêncio entre
  // rondas matava o ritmo da mesa. Fica muito abaixo dos efeitos e nunca por cima.
  isMusicOn: () => musicOn,
  toggleMusic() {
    musicOn = !musicOn;
    try {
      localStorage.setItem('fd_music', musicOn ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (musicOn) sfx.startMusic();
    else sfx.stopMusic();
    return musicOn;
  },
  startMusic() {
    const a = ac();
    if (!a || !musicOn || musicTimer) return;
    musicGain = a.createGain();
    musicGain.gain.setValueAtTime(MUSIC_VOL, a.currentTime);
    musicGain.connect(a.destination);

    // Progressão de 4 acordes em lá menor — festa sem ser irritante.
    const PROG = [
      [110, 164.81, 220], // Am
      [98, 146.83, 196], // G
      [87.31, 130.81, 174.61], // F
      [82.41, 123.47, 164.81], // E
    ];
    let step = 0;
    const bar = () => {
      if (!musicOn || muted) return;
      const now = a.currentTime;
      const chord = PROG[step % PROG.length];
      step += 1;
      musicNodes = musicNodes.filter((n) => {
        try { n.stop(); } catch { /* já parou */ }
        return false;
      });
      chord.forEach((freq, i) => {
        const osc = a.createOscillator();
        const g = a.createGain();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(i === 0 ? 0.5 : 0.22, now + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, now + 2.4);
        osc.connect(g).connect(musicGain);
        osc.start(now);
        osc.stop(now + 2.5);
        musicNodes.push(osc);
      });
    };
    bar();
    musicTimer = setInterval(bar, 2400);
  },
  stopMusic() {
    clearInterval(musicTimer);
    musicTimer = null;
    for (const n of musicNodes) {
      try { n.stop(); } catch { /* já parou */ }
    }
    musicNodes = [];
    try { musicGain?.disconnect(); } catch { /* ignore */ }
    musicGain = null;
  },
};
