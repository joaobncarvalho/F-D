// Confetti leve em canvas — sem dependências. Uma explosão que se limpa sozinha.
//
// As cores vêm do HUMOR da noite (mood.js): a mesma vitória atira verde-água em
// Leve e magenta em Caos. É de graça e faz a festa parecer que acompanha a mesa.

import { paleta } from './mood.js';

export function confetti({ count = 90, power = 14, cores } = {}) {
  const COLORS = cores || paleta();
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:60';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const W = window.innerWidth;
  const H = window.innerHeight;
  const cx = W / 2;
  const cy = H * 0.42;

  const parts = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = power * (0.4 + Math.random() * 0.9);
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      size: 5 + Math.random() * 7,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      life: 0,
    };
  });

  let raf;
  const start = performance.now();

  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.35; // gravidade
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 1600);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (elapsed < 1700) {
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
      canvas.remove();
    }
  }
  raf = requestAnimationFrame(frame);
}

export function haptic(pattern = 20) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
