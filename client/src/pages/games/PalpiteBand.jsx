import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../../sfx.js';
import { Avatar } from './shared.jsx';
import { MOLA, LISTA, ITEM_LISTA } from '../../motion.js';

/**
 * A faixa do palpite — a segunda camada de cada ronda.
 *
 * Enquanto um joga, os outros apostam no que vai acontecer. É o que tira sete
 * pessoas de espectadoras numa mesa de oito (ver server/src/game/palpites.js).
 *
 * A faixa aparece POR BAIXO da carta da ronda e nunca lhe rouba o lugar: quem
 * está a jogar continua a ver o seu desafio em grande, e a plateia ganha uma
 * coisa para fazer no espaço que antes era só de espera.
 *
 * Tem três estados, e um quarto para quem está a ser apostado:
 *   · por apostar   — a pergunta e os botões
 *   · apostado      — "já está", com a contagem da mesa
 *   · resolvido     — quem acertou e quem bebe
 *   · a ser apostado— quem joga a ronda vê a mesa a apostar em si (e é bom que veja)
 */
export default function PalpiteBand({ palpite, room, youId, onPalpite }) {
  if (!palpite) return null;

  const souAlvo = palpite.excluidos.includes(youId);
  const jaApostei = palpite.jaApostaram.includes(youId);
  // A plateia é quem PODE apostar agora mais quem já apostou. Sem a segunda
  // metade, quem apostasse e depois caísse (telemóvel a bloquear, wifi de festa)
  // saía do denominador e o contador mostrava "4 de 2".
  const elegiveis = new Set(
    room.players
      .filter((p) => p.connected && !p.eliminated && !palpite.excluidos.includes(p.id))
      .map((p) => p.id)
  );
  for (const id of palpite.jaApostaram) elegiveis.add(id);
  const plateia = elegiveis.size;
  const jogador = (id) => room.players.find((p) => p.id === id);

  // ----- Resolvido: quem leu bem a mesa, e quem paga --------------------------
  if (palpite.resolvido) {
    const meuAcerto = palpite.certos.some((c) => c.id === youId);
    const meuErro = palpite.errados.some((c) => c.id === youId);
    if (!palpite.certos.length && !palpite.errados.length) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOLA.suave}
        className="fd-card px-4 py-3 flex flex-col gap-2"
      >
        <p className="text-xs uppercase tracking-widest text-white/40 text-center">Palpites</p>
        {!!palpite.certos.length && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-sm text-emerald-300 font-bold">✅ Acertaram:</span>
            {palpite.certos.map((c) => (
              <span key={c.id} className="flex items-center gap-1 text-sm">
                <Avatar player={jogador(c.id)} size={22} /> {c.name}
              </span>
            ))}
          </div>
        )}
        {!!palpite.errados.length && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-sm text-rose-300 font-bold">🍺 Erraram ({palpite.golos}):</span>
            {palpite.errados.map((c) => (
              <span key={c.id} className="flex items-center gap-1 text-sm">
                <Avatar player={jogador(c.id)} size={22} /> {c.name}
              </span>
            ))}
          </div>
        )}
        {meuAcerto && <p className="text-center text-sm font-bold text-emerald-300">Leste bem a mesa 😏</p>}
        {meuErro && (
          <p className="text-center text-sm font-bold text-rose-300">
            Enganaste-te — {palpite.golos} golos 🍺
          </p>
        )}
      </motion.div>
    );
  }

  // ----- Quem está a jogar vê a mesa a apostar em si --------------------------
  if (souAlvo) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOLA.suave}
        className="fd-card px-4 py-3 text-center"
      >
        <p className="text-sm font-bold text-amber-300">👀 A mesa está a apostar em ti</p>
        <p className="text-xs text-white/45 mt-0.5">
          {palpite.jaApostaram.length} de {plateia} já deram palpite — e não sabes qual.
        </p>
      </motion.div>
    );
  }

  // ----- Já apostei: só falta ver ---------------------------------------------
  if (jaApostei) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOLA.suave}
        className="fd-card px-4 py-3 text-center"
      >
        <p className="text-sm font-bold text-cyan-300">🤫 Palpite dado</p>
        <p className="text-xs text-white/45 mt-0.5">
          {palpite.jaApostaram.length} de {plateia} na mesa. Ninguém vê os dos outros.
        </p>
      </motion.div>
    );
  }

  // ----- A apostar --------------------------------------------------------------
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOLA.pop}
      className="fd-card px-4 py-3 flex flex-col gap-2"
      style={{ borderColor: 'rgba(34,211,238,0.35)' }}
    >
      <p className="text-xs uppercase tracking-widest text-cyan-300/70 text-center">
        O teu palpite · erras, bebes {palpite.golos}
      </p>
      <p className="text-center font-bold">{palpite.pergunta}</p>
      <motion.div variants={LISTA} initial="initial" animate="animate" className="flex gap-2">
        <AnimatePresence>
          {palpite.opcoes.map((o) => (
            <motion.button
              key={o.key}
              variants={ITEM_LISTA}
              onClick={() => {
                sfx.click();
                onPalpite(o.key);
              }}
              className="fd-chip flex-1 text-center py-3"
            >
              {o.rotulo}
            </motion.button>
          ))}
        </AnimatePresence>
      </motion.div>
      <p className="text-[11px] text-white/35 text-center">
        {palpite.jaApostaram.length} de {plateia} já apostaram.
      </p>
    </motion.div>
  );
}
