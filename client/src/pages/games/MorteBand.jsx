import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { sfx } from '../../sfx.js';
import { Avatar } from './shared.jsx';
import { MOLA, LISTA, ITEM_LISTA } from '../../motion.js';

/**
 * O MODO DA MORTE, no ecrã (ver server/src/game/morte.js).
 *
 * Três coisas, por ordem de urgência:
 *
 *   1. o TESTAMENTO de quem acabou de sair (é um momento, e tapa o resto);
 *   2. a MÃO do fantasma, se fores um — as cartas que te devolvem poder;
 *   3. o estado do modo para toda a mesa: quantos caíram, o relógio a apertar,
 *      quantas cartas andam por aí.
 *
 * O ponto 3 é para os VIVOS. Saber que há sete cartas na plateia, sem saber
 * quais, é o que faz uma mesa olhar por cima do ombro — e é por isso que o
 * servidor manda a contagem e nunca as cartas.
 */
export default function MorteBand({ morte, mao, room, youId, onCarta, onTestamento }) {
  const [texto, setTexto] = useState('');
  const [aEscolherAlvo, setAEscolherAlvo] = useState(null); // key da carta
  if (!morte) return null;

  const testamentoMeu = morte.testamentoAberto?.deId === youId;
  const cartas = mao?.cartas || [];
  const souFantasma = cartas.length > 0 || morte.fantasmas.some((f) => f.id === youId);
  const totalCartas = morte.fantasmas.reduce((n, f) => n + f.cartas, 0);

  // ----- 1. O testamento --------------------------------------------------------
  if (testamentoMeu) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOLA.pop}
        className="fd-card px-4 py-3 flex flex-col gap-2"
        style={{ borderColor: 'rgba(244,63,94,0.55)' }}
      >
        <p className="text-xs uppercase tracking-widest text-rose-300/80 text-center">📜 O teu testamento</p>
        <p className="text-sm text-center text-white/70 leading-snug">
          Saíste. Deixa uma regra à mesa — vale até ao fim da noite, e eles têm de a cumprir.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim().length < 3) return;
            sfx.click();
            onTestamento(texto.trim());
            setTexto('');
          }}
          className="flex gap-2"
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ninguém pode dizer a palavra…"
            maxLength={120}
            className="fd-input flex-1"
          />
          <button type="submit" className="fd-btn fd-btn-primary px-4">
            📜
          </button>
        </form>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* ----- 3. O estado do modo, para toda a mesa ----------------------------- */}
      <div
        className="fd-card p-2.5 flex flex-wrap items-center gap-x-3 gap-y-1"
        style={{ borderColor: 'rgba(244,63,94,0.4)' }}
      >
        <span className="text-xs font-bold text-rose-300">💀 Última Ronda</span>
        <span className="text-xs text-white/60">
          {morte.mortes} {morte.mortes === 1 ? 'caído' : 'caídos'}
        </span>
        <span className="text-xs text-white/60">⏱️ {morte.segundosRonda}s por ronda</span>
        {totalCartas > 0 && (
          <span className="text-xs text-white/60" title="Ninguém sabe quais">
            🃏 {totalCartas} na plateia
          </span>
        )}
        {morte.condenada && (
          <span className="text-xs font-bold text-rose-300 w-full">
            💀 Ronda condenada: quem perder uma vida sai.
          </span>
        )}
        {morte.dueloFinal && (
          <span className="text-xs font-bold text-amber-300 w-full">⚔️ Restam dois. Duelo final.</span>
        )}
      </div>

      {/* Os testamentos já deixados ficam à vista: são regras a cumprir, e o
          painel de regras ativas mostra-as, mas aqui vê-se de quem vieram. */}
      {morte.fantasmas.some((f) => f.testamento) && (
        <div className="fd-card p-2.5 flex flex-col gap-1">
          <p className="text-xs font-bold text-white/50">👻 Deixados por quem já saiu</p>
          {morte.fantasmas
            .filter((f) => f.testamento)
            .map((f) => (
              <p key={f.id} className="text-xs text-white/70 leading-snug">
                <b className="text-white">{f.name}</b>: {f.testamento}
              </p>
            ))}
        </div>
      )}

      {/* ----- 2. A minha mão, se já saí ---------------------------------------- */}
      {souFantasma && (
        <div className="fd-card p-3 flex flex-col gap-2">
          <p className="text-sm font-bold text-rose-300">👻 És um fantasma</p>
          {cartas.length === 0 ? (
            <p className="text-xs text-white/45">
              Já gastaste as tuas cartas. Continua a fazer barulho.
            </p>
          ) : morte.cartaJogadaNaRonda ? (
            <p className="text-xs text-white/45">
              Já foi jogada uma carta nesta ronda. Espera pela próxima.
            </p>
          ) : (
            <motion.div variants={LISTA} initial="initial" animate="animate" className="flex flex-col gap-2">
              {cartas.map((c) => (
                <motion.button
                  key={c.key}
                  variants={ITEM_LISTA}
                  onClick={() => {
                    sfx.click();
                    if (c.precisaAlvo) setAEscolherAlvo(aEscolherAlvo === c.key ? null : c.key);
                    else onCarta(c.key, null);
                  }}
                  className={`fd-chip flex flex-col items-start gap-0.5 text-left ${
                    aEscolherAlvo === c.key ? 'fd-chip-on' : ''
                  }`}
                >
                  <span className="font-bold">
                    {c.emoji} {c.label}
                  </span>
                  <span className="text-xs opacity-70 font-normal leading-tight">{c.desc}</span>
                </motion.button>
              ))}
            </motion.div>
          )}

          <AnimatePresence>
            {aEscolherAlvo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2 overflow-hidden"
              >
                {room.players
                  .filter((p) =>
                    // 💞 Ressuscitar aponta a quem está FORA; as outras a quem
                    // ainda joga. É a única carta que olha para o outro lado.
                    aEscolherAlvo === 'ressuscitar'
                      ? p.eliminated && p.id !== youId
                      : p.connected && !p.eliminated
                  )
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        sfx.click();
                        onCarta(aEscolherAlvo, p.id);
                        setAEscolherAlvo(null);
                      }}
                      className="fd-chip flex items-center gap-1.5 text-xs"
                    >
                      <Avatar player={p} size={18} />
                      {p.name}
                    </button>
                  ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
