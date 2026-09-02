import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { sfx } from '../sfx.js';
import { haptic } from '../confetti.js';
import { abana } from '../mood.js';

/**
 * Roda de seleção do tipo de jogo (SVG animado).
 * O servidor é a autoridade: recebe `targetKey` e a roda anima até lá parar.
 *
 * ---------------------------------------------------------------------------
 * Porque é que isto não é só "rodar até ao ângulo certo":
 *
 * A roda é o único momento em que a mesa inteira olha para o mesmo sítio ao
 * mesmo tempo. Antes eram 4 voltas com uma curva e um fim seco — a informação
 * chegava, a tensão não. Agora tem as quatro fases que qualquer roda a sério
 * tem, e que o corpo reconhece sem pensar:
 *
 *   1. RECUO    — puxa para trás antes de arrancar. É o que faz o arranque
 *                 parecer força e não um corte de vídeo.
 *   2. GIRO     — arranca depressa e desacelera durante quase quatro segundos.
 *                 A curva ([0.08, 0.82, 0.15, 1]) tem cauda longa de propósito:
 *                 é no fim, quando já quase parou, que a mesa começa a gritar.
 *   3. TIQUES   — cada fatia que passa pelo ponteiro faz um tique E dá um piparote
 *                 no ponteiro. Vêm da rotação REAL (useMotionValue), não de um
 *                 temporizador — por isso abrandam sozinhos com a roda, que é o
 *                 que vende a desaceleração.
 *   4. ATERRAGEM— flash, a fatia vencedora acende, as outras apagam, vibração.
 *
 * Tamanho RESPONSIVO: viewBox fixo (0..200), escala sem distorcer.
 *
 * props:
 *   segments  [{ key, label, color, emoji }]  (ordem estável!)
 *   targetKey string | null   — tipo escolhido pelo servidor
 *   spinning  bool            — quando true, gira até targetKey
 *   onDone    ()=>void        — chamado quando a animação termina
 */

const RECUO_MS = 260;
const GIRO_S = 3.9;
const VOLTAS = 5;
// Abaixo disto os tiques deixam de ser tiques e passam a ser ruído (e no
// arranque a roda passa uma fatia a cada poucos milissegundos).
const TIQUE_MIN_MS = 55;

export default function Wheel({ segments, targetKey, spinning, onDone }) {
  const rot = useMotionValue(0);
  const alvoRef = useRef(0);
  const [pousou, setPousou] = useState(null); // key da fatia vencedora
  const [clarao, setClarao] = useState(false);
  const seg = 360 / segments.length;
  const R = 96;
  const C = 100;

  // Piparote do ponteiro a cada fatia — como a palheta de uma roda a sério.
  const ponteiro = useMotionValue(0);

  useEffect(() => {
    if (!spinning || !targetKey) return;
    const i = segments.findIndex((s) => s.key === targetKey);
    if (i < 0) return;

    setPousou(null);
    setClarao(false);

    // A rotação de PARTIDA tem de ser lida antes de `alvoRef` mudar — senão o
    // recuo já apontava para o destino final e despachava a volta toda em 260 ms.
    const partida = alvoRef.current;
    const centroAlvo = i * seg + seg / 2; // 0 = topo, sentido horário
    const desejado = (360 - centroAlvo) % 360;
    const atual = ((partida % 360) + 360) % 360;
    const delta = (desejado - atual + 360) % 360;
    const destino = partida + 360 * VOLTAS + delta;
    alvoRef.current = destino;

    // --- 3. Tiques: ouvem a rotação real ---
    let ultimaFatia = Math.floor(rot.get() / seg);
    let ultimoTique = 0;
    const parar = rot.on('change', (v) => {
      const fatia = Math.floor(v / seg);
      if (fatia === ultimaFatia) return;
      ultimaFatia = fatia;
      const agora = performance.now();
      if (agora - ultimoTique < TIQUE_MIN_MS) return;
      ultimoTique = agora;
      sfx.tick();
      animate(ponteiro, [-13, 0], { duration: 0.16, ease: 'easeOut' });
    });

    let cancelado = false;
    let giro;

    // --- 1. Recuo ---
    const recuo = animate(rot, partida - 15, {
      duration: RECUO_MS / 1000,
      ease: 'easeOut',
    });

    recuo.then(() => {
      if (cancelado) return;
      sfx.spin();
      haptic(18);
      // --- 2. Giro com cauda longa ---
      giro = animate(rot, destino, {
        duration: GIRO_S,
        ease: [0.08, 0.82, 0.15, 1],
      });
      giro.then(() => {
        if (cancelado) return;
        parar();
        // --- 4. Aterragem ---
        setPousou(targetKey);
        setClarao(true);
        sfx.reveal();
        haptic([35, 45, 60]);
        abana('leve'); // só se a noite já estiver quente (mood.js decide)
        setTimeout(() => setClarao(false), 320);
        setTimeout(() => onDone?.(), 760);
      });
    });

    return () => {
      cancelado = true;
      parar();
      recuo.stop();
      giro?.stop();
    };
  }, [spinning, targetKey]);

  // O halo acende com a velocidade: a roda "aquece" ao girar e arrefece ao parar.
  const haloOpacidade = useMotionValue(0.5);
  useEffect(() => {
    let anterior = rot.get();
    let ultimo = performance.now();
    const parar = rot.on('change', (v) => {
      const agora = performance.now();
      const dt = Math.max(16, agora - ultimo);
      const graus = Math.abs(v - anterior) / dt; // graus por ms
      anterior = v;
      ultimo = agora;
      haloOpacidade.set(Math.min(0.95, 0.45 + graus * 0.28));
    });
    return parar;
  }, []);

  return (
    <div className="relative mx-auto" style={{ width: 'min(86vw, 400px)', aspectRatio: '1 / 1' }}>
      {/* Halo com brilho — acende com a velocidade da roda */}
      <motion.div
        className="absolute inset-[-12px] rounded-full"
        style={{
          zIndex: 0,
          background: 'conic-gradient(from 0deg, #ff3d8b, #9b5cff, #ffb020, #1fd3b6, #ff3d8b)',
          filter: 'blur(16px)',
          opacity: haloOpacidade,
        }}
      />

      {/* Clarão de aterragem */}
      {clarao && (
        <motion.div
          initial={{ opacity: 0.85, scale: 0.9 }}
          animate={{ opacity: 0, scale: 1.35 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          className="absolute inset-[-12px] rounded-full pointer-events-none"
          style={{ zIndex: 5, background: 'radial-gradient(circle, #fff 0%, transparent 65%)' }}
        />
      )}

      {/* Ponteiro fixo no topo (dá um piparote a cada fatia) */}
      <motion.div
        className="absolute left-1/2 -top-1 z-10"
        style={{
          x: '-50%',
          rotate: ponteiro,
          transformOrigin: '50% 10%',
          width: 0,
          height: 0,
          borderLeft: '15px solid transparent',
          borderRight: '15px solid transparent',
          borderTop: '26px solid #ffffff',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
        }}
      />

      <motion.div
        style={{
          rotate: rot,
          position: 'relative',
          zIndex: 1,
          width: '100%',
          height: '100%',
          transformOrigin: 'center',
        }}
      >
        <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ display: 'block' }}>
          {segments.map((s, i) => {
            const a0 = (-90 + i * seg) * (Math.PI / 180);
            const a1 = (-90 + (i + 1) * seg) * (Math.PI / 180);
            const x0 = C + R * Math.cos(a0);
            const y0 = C + R * Math.sin(a0);
            const x1 = C + R * Math.cos(a1);
            const y1 = C + R * Math.sin(a1);
            const large = seg > 180 ? 1 : 0;
            const mid = (-90 + i * seg + seg / 2) * (Math.PI / 180);
            const lx = C + R * 0.66 * Math.cos(mid);
            const ly = C + R * 0.66 * Math.sin(mid);
            // Depois de pousar: a vencedora fica, as outras apagam-se. É o que
            // faz o olho ir ter com o resultado sem ninguém apontar para ele.
            const venceu = pousou === s.key;
            const apagada = pousou && !venceu;
            return (
              <g
                key={s.key}
                style={{
                  opacity: apagada ? 0.22 : 1,
                  transition: 'opacity 0.45s ease',
                }}
              >
                <path
                  d={`M${C},${C} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`}
                  fill={s.color}
                  stroke={venceu ? '#ffffff' : '#0f0f14'}
                  strokeWidth={venceu ? 2.5 : 1.5}
                  style={{ transition: 'stroke 0.3s ease, stroke-width 0.3s ease' }}
                />
                <text
                  x={lx}
                  y={ly}
                  fontSize={venceu ? 23 : 17}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ transition: 'font-size 0.35s cubic-bezier(0.16,1,0.3,1)' }}
                >
                  {s.emoji}
                </text>
              </g>
            );
          })}
          <circle cx={C} cy={C} r="15" fill="#0f0f14" stroke="#f5f5f7" strokeWidth="2" />
        </svg>
      </motion.div>
    </div>
  );
}
