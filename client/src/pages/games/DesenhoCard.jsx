// F&D — Desenha e Adivinha.
//
// Quem desenha vê a palavra (canal privado) e usa o telemóvel como tela; os
// traços vão por `draw_stroke`, um canal próprio — nunca pelo estado da sala,
// que teria de aguentar dezenas de pontos por segundo.
//
// As coordenadas viajam NORMALIZADAS (0..1) para que cada ecrã, com o seu
// tamanho, desenhe o mesmo traço.

import { useEffect, useRef, useState } from 'react';
import { CardShell, Avatar } from './shared.jsx';
import Timer from '../../components/Timer.jsx';
import { socket } from '../../socket.js';
import { sfx } from '../../sfx.js';

const CORES = ['#ffffff', '#ff3d8b', '#ffb020', '#1fd3b6', '#5b8cff', '#111111'];

function Tela({ isDrawer, color, width, onStroke }) {
  const ref = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const buffer = useRef([]);

  // Redimensiona para a densidade do ecrã (senão fica tudo esborratado).
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctxRef.current = ctx;
  }, []);

  /** Desenha um traço já normalizado (0..1) — usado por quem desenha E por quem vê. */
  function paint({ points, color: c = '#fff', width: w = 4 }) {
    const canvas = ref.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx || points.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(points[0][0] * rect.width, points[0][1] * rect.height);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0] * rect.width, points[i][1] * rect.height);
    ctx.stroke();
  }

  function clear() {
    const canvas = ref.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Recebe os traços de quem desenha (só para os espectadores).
  useEffect(() => {
    const onStrokeIn = (s) => paint(s);
    const onClear = () => clear();
    socket.on('draw_stroke', onStrokeIn);
    socket.on('draw_clear', onClear);
    // O servidor só reencaminha o "limpar" aos OUTROS — a tela de quem desenha
    // limpa-se por este evento local.
    window.addEventListener('fd-draw-clear-local', onClear);
    return () => {
      socket.off('draw_stroke', onStrokeIn);
      socket.off('draw_clear', onClear);
      window.removeEventListener('fd-draw-clear-local', onClear);
    };
  }, []);

  function pos(e) {
    const rect = ref.current.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return [(t.clientX - rect.left) / rect.width, (t.clientY - rect.top) / rect.height];
  }

  function flush() {
    if (buffer.current.length >= 2) onStroke({ points: buffer.current, color, width });
    buffer.current = buffer.current.slice(-1); // continuidade entre lotes
  }

  function start(e) {
    if (!isDrawer) return;
    e.preventDefault();
    drawing.current = true;
    buffer.current = [pos(e)];
  }
  function move(e) {
    if (!isDrawer || !drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    const prev = buffer.current[buffer.current.length - 1];
    buffer.current.push(p);
    if (prev) paint({ points: [prev, p], color, width });
    if (buffer.current.length >= 12) flush(); // envia em lotes: menos pacotes, traço contínuo
  }
  function end() {
    if (!isDrawer || !drawing.current) return;
    drawing.current = false;
    flush();
    buffer.current = [];
  }

  return (
    <canvas
      ref={ref}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
      className="w-full rounded-2xl bg-white/5 border border-white/15 touch-none"
      style={{ height: '46vh', cursor: isDrawer ? 'crosshair' : 'default' }}
    />
  );
}

export function DesenhoCard({ round, room, youId, word, canControl, onStart, onGuess, onGiveUp, onContinue }) {
  const isDrawer = round.currentPlayerId === youId;
  const [color, setColor] = useState('#ffffff');
  const [width, setWidth] = useState(5);
  const [palpite, setPalpite] = useState('');
  const jogador = (id) => room.players.find((p) => p.id === id);

  function enviarTraco(stroke) {
    socket.emit('draw_stroke', stroke);
  }

  function limpar() {
    socket.emit('draw_clear');
    // O próprio ecrã é limpo pelo evento que o servidor devolve aos outros; o de
    // quem desenha limpa-se aqui via re-render forçado da tela.
    window.dispatchEvent(new Event('fd-draw-clear-local'));
  }

  return (
    <CardShell typeKey="desenho">
      <p className="text-sm text-white/60">
        🎨 <b>{round.currentPlayerName}</b> desenha — o resto da mesa adivinha.
      </p>

      {round.substate === 'ready' && (
        <>
          {isDrawer ? (
            <>
              <p className="text-sm text-white/50">A tua palavra (só tu a vês):</p>
              <p className="text-3xl font-extrabold text-emerald-300">{word?.word || '…'}</p>
              <button onClick={() => { sfx.click(); onStart(); }} className="fd-btn fd-btn-primary text-lg py-4">
                🖌️ Começar a desenhar
              </button>
            </>
          ) : (
            <p className="text-lg text-white/60">A preparar os lápis… ✏️</p>
          )}
        </>
      )}

      {round.substate === 'drawing' && (
        <>
          <div className="flex items-center justify-between gap-2">
            {isDrawer ? (
              <p className="text-lg font-extrabold text-emerald-300">{word?.word || '…'}</p>
            ) : (
              <p className="text-sm text-white/50">O que é isto?</p>
            )}
            <Timer seconds={round.seconds || 75} runKey={round.id} size={56} />
          </div>

          <Tela isDrawer={isDrawer} color={color} width={width} onStroke={enviarTraco} />

          {isDrawer ? (
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {CORES.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-white' : 'border-white/20'}`}
                  style={{ background: c }}
                  aria-label={`cor ${c}`}
                />
              ))}
              <input
                type="range"
                min="2"
                max="18"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-24"
                aria-label="espessura"
              />
              <button onClick={limpar} className="fd-chip">🧽 Limpar</button>
              <button onClick={() => { sfx.click(); onGiveUp(); }} className="fd-chip text-rose-300">
                🏳️ Desisto
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const t = palpite.trim();
                if (t.length < 2) return;
                sfx.click();
                onGuess(t);
                setPalpite('');
              }}
              className="flex gap-2"
            >
              <input
                value={palpite}
                onChange={(e) => setPalpite(e.target.value)}
                placeholder="O teu palpite…"
                maxLength={40}
                className="fd-input flex-1"
              />
              <button type="submit" className="fd-btn fd-btn-primary px-5">➤</button>
            </form>
          )}

          <div className="flex flex-col gap-0.5 max-h-24 overflow-y-auto">
            {(round.guesses || []).slice(-6).map((g, i) => (
              <p key={i} className={`text-sm ${g.correct ? 'text-emerald-300 font-bold' : 'text-white/50'}`}>
                <b>{g.name}:</b> {g.text} {g.correct && '✓'}
              </p>
            ))}
          </div>
        </>
      )}

      {round.substate === 'result' && round.result && (
        <>
          <p className="text-sm text-white/50">A palavra era:</p>
          <p className="text-3xl font-extrabold text-emerald-300">{round.result.word}</p>
          {round.result.winner ? (
            <p className="text-lg font-bold flex items-center gap-2 justify-center">
              <Avatar player={jogador(round.result.winner.id)} size={26} />
              {round.result.winner.name} acertou! 🎉
            </p>
          ) : (
            <p className="text-lg font-bold text-rose-300">Ninguém acertou — {round.result.drawer.name} bebe!</p>
          )}
          {!!round.result.drinkers?.length && (
            <p className="text-sm text-rose-300">
              🍺 Bebem {round.result.golos}: {round.result.drinkers.map((d) => d.name).join(' · ')}
            </p>
          )}
          {canControl && (
            <button onClick={() => { sfx.click(); onContinue(); }} className="fd-btn fd-btn-primary">
              Continuar →
            </button>
          )}
        </>
      )}
    </CardShell>
  );
}
