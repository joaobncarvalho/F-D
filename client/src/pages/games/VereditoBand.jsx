import { motion } from 'framer-motion';
import { sfx } from '../../sfx.js';
import { Avatar } from './shared.jsx';
import { MOLA, LISTA, ITEM_LISTA } from '../../motion.js';

/**
 * O veredito da mesa.
 *
 * Antes, quem dizia se a pessoa tinha conseguido era ela própria — ou o host, a
 * partir do telemóvel dele. Agora vota a mesa toda menos quem atuou, e a maioria
 * manda (ver server/src/game/veredito.js). Falhar custa uma VIDA, e é por isso
 * que o preço aparece escrito no botão: ninguém deve votar sem saber o que está
 * a fazer a outra pessoa.
 *
 * Os votos são secretos até fechar, como os palpites. O que se mostra é só
 * quantos já votaram.
 */
export default function VereditoBand({ veredito, room, youId, onVota }) {
  if (!veredito) return null;

  const souAtor = veredito.atores.includes(youId);
  const jaVotei = veredito.jaVotaram.includes(youId);
  const jogador = (id) => room.players.find((p) => p.id === id);

  // Quem pode votar mais quem já votou — pelo mesmo motivo da faixa de palpites:
  // quem votou e depois caiu não pode sair do denominador.
  const elegiveis = new Set(
    room.players
      .filter((p) => p.connected && !p.eliminated && !veredito.atores.includes(p.id))
      .map((p) => p.id)
  );
  for (const id of veredito.jaVotaram) elegiveis.add(id);
  const total = elegiveis.size;

  // ----- Fechado ---------------------------------------------------------------
  if (veredito.fechado) {
    const passou = veredito.resultado === 'sim';
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOLA.suave}
        className="fd-card px-4 py-3 text-center"
      >
        <p className="text-xs uppercase tracking-widest text-white/40">Veredito da mesa</p>
        <p className={`fd-title text-xl font-extrabold ${passou ? 'text-emerald-300' : 'text-rose-300'}`}>
          {passou ? '👏 A mesa deu por bom' : '💔 A mesa não deu por bom'}
        </p>
        <p className="text-sm text-white/55 mt-0.5">
          {veredito.sim} a favor · {veredito.nao} contra
          {!passou && ' — menos uma vida'}
        </p>
      </motion.div>
    );
  }

  // ----- Quem atuou está a ser julgado ------------------------------------------
  if (souAtor) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOLA.suave}
        className="fd-card px-4 py-3 text-center"
        style={{ borderColor: 'rgba(255,176,32,0.4)' }}
      >
        <p className="text-sm font-bold text-amber-300">⚖️ A mesa está a decidir</p>
        <p className="text-xs text-white/45 mt-0.5">
          {veredito.jaVotaram.length} de {total} já votaram. Não podes votar em ti.
        </p>
      </motion.div>
    );
  }

  // ----- Já votei ----------------------------------------------------------------
  if (jaVotei) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOLA.suave}
        className="fd-card px-4 py-3 text-center"
      >
        <p className="text-sm font-bold text-cyan-300">🤫 Voto dado</p>
        <p className="text-xs text-white/45 mt-0.5">
          {veredito.jaVotaram.length} de {total}. Ninguém vê os votos dos outros.
        </p>
      </motion.div>
    );
  }

  // ----- A votar -----------------------------------------------------------------
  const ator = jogador(veredito.atores[0]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOLA.pop}
      className="fd-card px-4 py-3 flex flex-col gap-2"
      style={{ borderColor: 'rgba(255,176,32,0.45)' }}
    >
      <p className="text-xs uppercase tracking-widest text-amber-300/80 text-center">
        Veredito da mesa · se falhar, perde uma vida
      </p>
      <p className="text-center font-bold flex items-center justify-center gap-2">
        {ator && <Avatar player={ator} size={24} />}
        {veredito.pergunta}
      </p>
      <motion.div variants={LISTA} initial="initial" animate="animate" className="flex gap-2">
        <motion.button
          variants={ITEM_LISTA}
          onClick={() => {
            sfx.click();
            onVota('sim');
          }}
          className="fd-btn fd-btn-success flex-1 py-3"
        >
          👏 Conseguiu
        </motion.button>
        <motion.button
          variants={ITEM_LISTA}
          onClick={() => {
            sfx.click();
            onVota('nao');
          }}
          className="fd-btn fd-btn-danger flex-1 py-3"
        >
          💔 Não conseguiu
        </motion.button>
      </motion.div>
      <p className="text-[11px] text-white/35 text-center">
        {veredito.jaVotaram.length} de {total} já votaram · empate favorece quem atuou
      </p>
    </motion.div>
  );
}
