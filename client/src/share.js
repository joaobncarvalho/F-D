// F&D — cartão de resultados partilhável.
//
// Fecha a noite com um momento: desenha o pódio num canvas 1080×1350 (formato de
// story) e tenta partilhar pelo Web Share API; se o dispositivo não souber
// partilhar ficheiros, faz download. É a única peça do jogo que sai da sala — e
// é a que faz alguém perguntar "que jogo é esse?".

const W = 1080;
const H = 1350;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param data { title, subtitle, rows: [{ emoji, name, detail, highlight }], awards: [{emoji,label,name}] }
 */
export function drawResultCard(data) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Fundo: o mesmo escuro da app com dois halos de festa.
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(0, 0, W, H);
  const halo = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  halo(180, 160, 620, 'rgba(255,61,139,0.45)');
  halo(920, 300, 640, 'rgba(155,92,255,0.40)');
  halo(760, 1240, 620, 'rgba(31,211,182,0.28)');

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '800 84px system-ui, sans-serif';
  ctx.fillText(data.title || 'F&D', W / 2, 150);

  ctx.font = '500 36px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.fillText(data.subtitle || '', W / 2, 208);

  // Prémios em cartões lado a lado.
  const awards = (data.awards || []).slice(0, 3);
  if (awards.length) {
    const cw = (W - 120 - (awards.length - 1) * 24) / awards.length;
    awards.forEach((a, i) => {
      const x = 60 + i * (cw + 24);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      roundRect(ctx, x, 260, cw, 230, 34);
      ctx.fill();
      ctx.font = '80px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(a.emoji || '🏆', x + cw / 2, 360);
      ctx.font = '600 27px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(a.label || '', x + cw / 2, 402);
      ctx.font = '800 38px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(a.name || '—', x + cw / 2, 452);
    });
  }

  // Classificação.
  const rows = (data.rows || []).slice(0, 8);
  let y = awards.length ? 560 : 300;
  ctx.textAlign = 'left';
  rows.forEach((r, i) => {
    ctx.fillStyle = r.highlight ? 'rgba(255,61,139,0.20)' : 'rgba(255,255,255,0.06)';
    roundRect(ctx, 60, y, W - 120, 92, 26);
    ctx.fill();
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(`${i + 1}`, 92, y + 60);
    ctx.font = '46px system-ui, sans-serif';
    ctx.fillText(r.emoji || '', 150, y + 60);
    ctx.font = '700 42px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(String(r.name || '').slice(0, 16), 220, y + 60);
    ctx.textAlign = 'right';
    ctx.font = '600 36px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(r.detail || '', W - 92, y + 60);
    ctx.textAlign = 'left';
    y += 106;
  });

  ctx.textAlign = 'center';
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.fillText('F&D — Friends and Drinking 🍻', W / 2, H - 60);

  return canvas;
}

/** Desenha e partilha (ou descarrega, se não houver partilha de ficheiros). */
export async function shareResultCard(data) {
  const canvas = drawResultCard(data);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return false;
  const file = new File([blob], 'fd-resultado.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'F&D', text: 'A nossa noite de F&D 🍻' });
      return true;
    } catch {
      return false; // o utilizador cancelou — não é erro
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fd-resultado.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}
