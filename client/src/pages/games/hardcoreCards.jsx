// F&D — cartões dos seis tipos "hardcore" (ver server/src/game/{bomba,leilao,
// sincronia,detetor,julgamento,contrato}.js).
//
// Todos partilham a mesma disciplina de ecrã: nunca mostrar aquilo que o
// servidor está deliberadamente a esconder (o pavio, as licitações, as respostas
// da dupla, a marca do detetor). Se um destes cartões precisar de um campo que o
// serializador não manda, é sinal de que o desenho está errado — não de que o
// payload devia mandar mais.

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { sfx } from '../../sfx.js';
import { CardShell, Avatar } from './shared.jsx';
import VereditoBand from './VereditoBand.jsx';
import { MOLA, LISTA, ITEM_LISTA } from '../../motion.js';

/** Grelha de caras para escolher alguém. Repete-se nos seis, por isso vive aqui. */
function EscolheJogador({ room, exclui = [], onPick, filtra = null }) {
  const alvos = room.players.filter(
    (p) => p.connected && !p.eliminated && !exclui.includes(p.id) && (!filtra || filtra(p))
  );
  return (
    <motion.div variants={LISTA} initial="initial" animate="animate" className="flex flex-wrap justify-center gap-2">
      {alvos.map((p) => (
        <motion.button
          key={p.id}
          variants={ITEM_LISTA}
          onClick={() => {
            sfx.click();
            onPick(p.id);
          }}
          className="fd-chip flex items-center gap-2"
        >
          <Avatar player={p} size={22} />
          {p.name}
        </motion.button>
      ))}
    </motion.div>
  );
}

function Continuar({ canControl, onContinue, label = '➡️ Continuar' }) {
  if (!canControl) return <p className="text-sm text-white/40">À espera que continuem…</p>;
  return (
    <button onClick={() => { sfx.click(); onContinue(); }} className="fd-btn fd-btn-primary">
      {label}
    </button>
  );
}

/** Quantos já agiram, de quantos podiam. O denominador conta quem já agiu e
 *  caiu, como nas faixas de palpites e de veredito. */
function Progresso({ room, jaAgiram = [], exclui = [] }) {
  const podem = new Set(
    room.players.filter((p) => p.connected && !p.eliminated && !exclui.includes(p.id)).map((p) => p.id)
  );
  for (const id of jaAgiram) podem.add(id);
  return (
    <p className="text-[11px] text-white/35">
      {jaAgiram.length} de {podem.size} já decidiram · ninguém vê as escolhas dos outros
    </p>
  );
}

// ----- Bomba-Relógio ---------------------------------------------------------

export function BombaCard({ round, room, youId, canControl, onPassa, onContinue }) {
  const souEu = round.holderId === youId;
  const holder = room.players.find((p) => p.id === round.holderId);

  if (round.substate === 'rebentou') {
    const r = round.result;
    return (
      <CardShell typeKey="bomba">
        <motion.p
          initial={{ scale: 0.6, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={MOLA.pop}
          className="fd-title text-3xl font-extrabold text-rose-300"
        >
          💥 BUM
        </motion.p>
        <p className="text-lg">
          Rebentou nas mãos do <b>{r.quemName}</b> — menos uma vida.
        </p>
        {/* A bomba tem dois pavios (tempo e passagens) e rebenta o primeiro a
            acabar — ver server/src/game/bomba.js. No fim revela-se qual foi:
            dizer sempre "o pavio era de Xs" numa que rebentou às voltas seria
            mentir à mesa sobre o que a matou. */}
        <p className="text-sm text-white/45">
          {r.porque === 'passagens'
            ? `${r.passagens} passagens — não aguentou mais voltas`
            : `${r.passagens} passagens · o pavio era de ${r.segundos}s`}
        </p>
        <Continuar canControl={canControl} onContinue={onContinue} />
      </CardShell>
    );
  }

  return (
    <CardShell typeKey="bomba">
      <p className="text-sm text-white/50">Digam um de cada vez, alto:</p>
      <p className="text-2xl font-bold leading-snug">{round.tema}</p>
      {/* Nunca há cronómetro: o pavio é secreto, e mostrar quanto falta era
          transformar o jogo inteiro numa contagem decrescente. */}
      <motion.p
        animate={{ scale: [1, 1.14, 1] }}
        transition={{ duration: 0.85, repeat: Infinity }}
        className="text-5xl"
      >
        💣
      </motion.p>
      {souEu ? (
        <>
          <p className="text-sm font-bold text-rose-300">Está contigo. Diz um e passa!</p>
          <button onClick={() => { sfx.click(); onPassa(); }} className="fd-btn fd-btn-danger py-4 text-lg">
            🔥 Disse — passa!
          </button>
        </>
      ) : (
        <p className="text-lg flex items-center justify-center gap-2">
          {holder && <Avatar player={holder} size={26} />}
          está com a bomba…
        </p>
      )}
      <p className="text-[11px] text-white/35">{round.passagens} passagens até agora</p>
    </CardShell>
  );
}

// ----- Leilão ----------------------------------------------------------------

export function LeilaoCard({ round, room, youId, canControl, onLicita, onContinue }) {
  const [valor, setValor] = useState(2);
  const jaLicitei = round.jaLicitaram.includes(youId);
  const souParticipante = round.participantes.includes(youId);

  if (round.substate === 'result') {
    const r = round.result;
    return (
      <CardShell typeKey="leilao">
        <p className="text-sm text-white/50">O desafio era:</p>
        <p className="text-lg leading-snug">{r.desafio}</p>
        {r.vazio ? (
          <p className="text-white/60">Ninguém licitou a tempo — o leilão deu em nada.</p>
        ) : (
          <>
            <p className="fd-title text-2xl font-extrabold text-amber-300">
              🔨 {r.executorName} faz o desafio
            </p>
            <p className="text-sm text-white/55">
              Licitou {r.minimo} — o mais baixo{r.empate ? ' (houve empate e saiu à sorte)' : ''}. E não bebe nada.
            </p>
            {r.pagantes.length > 0 && (
              <div className="flex flex-col gap-0.5 mt-1">
                {r.pagantes.map((p) => (
                  <p key={p.id} className="text-sm text-white/60">
                    {p.name} paga o que licitou: <b className="text-white">{p.golos}</b>
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        <Continuar canControl={canControl} onContinue={onContinue} />
      </CardShell>
    );
  }

  return (
    <CardShell typeKey="leilao">
      <p className="text-sm text-white/50">Ninguém quer isto:</p>
      <p className="text-lg leading-snug">{round.desafio}</p>
      <p className="text-sm text-amber-300/90">
        Quantos goles bebes para <b>não</b> o fazer? Quem licitar menos, faz — e não bebe.
      </p>
      {souParticipante && !jaLicitei ? (
        <>
          <div className="flex justify-center gap-2 flex-wrap">
            {Array.from({ length: round.maxLicitacao + 1 }, (_, i) => (
              <button
                key={i}
                onClick={() => { sfx.click(); setValor(i); }}
                className={`fd-chip w-11 ${valor === i ? 'fd-chip-on' : ''}`}
              >
                {i}
              </button>
            ))}
          </div>
          <button onClick={() => { sfx.click(); onLicita(valor); }} className="fd-btn fd-btn-primary">
            🔒 Licitar {valor} {valor === 1 ? 'gole' : 'goles'}
          </button>
        </>
      ) : (
        <p className="text-sm text-cyan-300">{jaLicitei ? '🤫 Licitação fechada' : 'A ver o leilão…'}</p>
      )}
      <Progresso room={room} jaAgiram={round.jaLicitaram} />
    </CardShell>
  );
}

// ----- Sincronia -------------------------------------------------------------

export function SincroniaCard({ round, room, youId, canControl, onResponde, onContinue }) {
  const naDupla = round.dupla.includes(youId);
  const jaRespondi = round.jaResponderam.includes(youId);
  const nomes = round.dupla.map((id) => room.players.find((p) => p.id === id)?.name).filter(Boolean);

  if (round.substate === 'result') {
    const r = round.result;
    return (
      <CardShell typeKey="sincronia">
        <p className="text-sm text-white/50">{round.pergunta}</p>
        <div className="flex justify-center gap-6 my-1">
          {r.escolhas.map((e) => (
            <div key={e.id} className="flex flex-col items-center gap-1">
              <span className="text-xs text-white/45">{e.name}</span>
              <span className="text-lg font-bold">{e.escolhaName || '—'}</span>
            </div>
          ))}
        </div>
        <p className={`fd-title text-2xl font-extrabold ${r.bateu ? 'text-emerald-300' : 'text-rose-300'}`}>
          {r.bateu ? '🔗 Em sincronia!' : '💔 Não bateu certo'}
        </p>
        <p className="text-sm text-white/55">
          {r.bateu
            ? `Bebe a mesa toda: ${r.bebedores.map((b) => b.name).join(', ')}`
            : `Bebem 2 cada: ${r.bebedores.map((b) => b.name).join(' e ')}`}
        </p>
        <Continuar canControl={canControl} onContinue={onContinue} />
      </CardShell>
    );
  }

  return (
    <CardShell typeKey="sincronia">
      <p className="text-sm text-white/50">
        <b className="text-white">{nomes.join(' + ')}</b> respondem em segredo. Se derem a mesma
        resposta, bebe a mesa; se não, bebem os dois.
      </p>
      <p className="text-lg leading-snug">{round.pergunta}</p>
      {naDupla && !jaRespondi ? (
        <EscolheJogador room={room} exclui={[]} onPick={onResponde} />
      ) : (
        <p className="text-sm text-cyan-300">{jaRespondi ? '🤫 Resposta guardada' : 'A torcer contra…'}</p>
      )}
      <Progresso room={room} jaAgiram={round.jaResponderam} exclui={room.players.filter((p) => !round.dupla.includes(p.id)).map((p) => p.id)} />
    </CardShell>
  );
}

// ----- Detetor de Mentiras ---------------------------------------------------

export function DetetorCard({ round, room, youId, canControl, onMarca, onVota, onContinue }) {
  const souAtor = round.currentPlayerId === youId;
  const jaVotei = round.jaVotaram.includes(youId);

  if (round.substate === 'result') {
    const r = round.result;
    return (
      <CardShell typeKey="detetor">
        <p className="text-sm text-white/50">{round.pergunta}</p>
        <p className={`fd-title text-2xl font-extrabold ${r.eraVerdade ? 'text-emerald-300' : 'text-rose-300'}`}>
          {r.eraVerdade ? '✅ Era VERDADE' : '🤥 Era MENTIRA'}
        </p>
        {r.extremo === 'enganou_todos' && (
          <p className="text-sm text-amber-300">🏆 Enganou a mesa toda — ganha uma vida.</p>
        )}
        {r.extremo === 'lido_por_todos' && (
          <p className="text-sm text-rose-300">🔍 A mesa leu-o todo — perde uma vida.</p>
        )}
        <p className="text-sm text-white/55">
          Acertaram: {r.acertaram.map((p) => p.name).join(', ') || '—'}
        </p>
        <p className="text-sm text-white/55">
          Bebem {r.custo}: {r.falharam.map((p) => p.name).join(', ') || 'ninguém'}
        </p>
        <Continuar canControl={canControl} onContinue={onContinue} />
      </CardShell>
    );
  }

  if (round.substate === 'responder') {
    return (
      <CardShell typeKey="detetor">
        <p className="text-lg leading-snug">{round.pergunta}</p>
        <p className="text-sm text-white/50">
          Vez de <b className="text-white">{round.currentPlayerName}</b> — responde em voz alta.
          Podes mentir à vontade.
        </p>
        {souAtor ? (
          <>
            <p className="text-sm text-amber-300">Depois de responderes, marca aqui a verdade. Ninguém vê.</p>
            <div className="flex gap-3">
              <button onClick={() => { sfx.click(); onMarca(true); }} className="fd-btn fd-btn-success flex-1">
                ✅ Era verdade
              </button>
              <button onClick={() => { sfx.click(); onMarca(false); }} className="fd-btn fd-btn-danger flex-1">
                🤥 Era mentira
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-white/40">Ouçam com atenção…</p>
        )}
      </CardShell>
    );
  }

  return (
    <CardShell typeKey="detetor">
      <p className="text-lg leading-snug">{round.pergunta}</p>
      <p className="text-sm text-white/50">
        <b className="text-white">{round.currentPlayerName}</b> já respondeu. Acreditam?
      </p>
      {souAtor ? (
        <p className="text-sm text-amber-300">⚖️ A mesa está a decidir. Cara de poker.</p>
      ) : jaVotei ? (
        <p className="text-sm text-cyan-300">🤫 Voto dado</p>
      ) : (
        <div className="flex gap-3">
          <button onClick={() => { sfx.click(); onVota('acredito'); }} className="fd-btn fd-btn-success flex-1 py-3">
            ✅ Acredito
          </button>
          <button onClick={() => { sfx.click(); onVota('mentira'); }} className="fd-btn fd-btn-danger flex-1 py-3">
            🤥 Está a mentir
          </button>
        </div>
      )}
      <p className="text-[11px] text-white/35">Quem votar mal bebe {round.custoVotoErrado}.</p>
      <Progresso room={room} jaAgiram={round.jaVotaram} exclui={[round.currentPlayerId]} />
    </CardShell>
  );
}

// ----- Julgamento ------------------------------------------------------------

export function JulgamentoCard({ round, room, youId, canControl, onAoVoto, onVota, onContinue }) {
  const reu = room.players.find((p) => p.id === round.reuId);
  const adv = room.players.find((p) => p.id === round.advogadoId);

  if (round.substate === 'result') {
    const r = round.result;
    return (
      <CardShell typeKey="julgamento">
        <p className="text-sm text-white/50">{r.reuName}: {round.acusacao}</p>
        <p className={`fd-title text-2xl font-extrabold ${r.inocente ? 'text-emerald-300' : 'text-rose-300'}`}>
          {r.inocente ? '⚖️ ABSOLVIDO' : '🔨 CULPADO'}
        </p>
        <p className="text-sm text-white/55">
          {r.inocentes} inocente · {r.culpados} culpado
        </p>
        {r.inocente ? (
          <p className="text-sm text-white/60">
            {r.pagantes.length
              ? `Quem condenou bebe ${r.custo}: ${r.pagantes.map((p) => p.name).join(', ')}.`
              : 'Ninguém o condenou.'}{' '}
            {r.advogadoName} ganha uma vida pela defesa.
          </p>
        ) : (
          <p className="text-sm text-white/60">{r.reuName} perde uma vida.</p>
        )}
        <Continuar canControl={canControl} onContinue={onContinue} />
      </CardShell>
    );
  }

  return (
    <CardShell typeKey="julgamento">
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1">
          {reu && <Avatar player={reu} size={40} ring />}
          <span className="text-[11px] uppercase tracking-widest text-rose-300/80">Réu</span>
        </div>
        <span className="text-white/25 text-xl">vs</span>
        <div className="flex flex-col items-center gap-1">
          {adv && <Avatar player={adv} size={40} ring />}
          <span className="text-[11px] uppercase tracking-widest text-emerald-300/80">Defesa</span>
        </div>
      </div>
      <p className="text-lg leading-snug">
        <b>{round.reuName}</b> {round.acusacao}
      </p>

      {round.substate === 'defesa' ? (
        <>
          <p className="text-sm text-white/50">
            <b className="text-white">{round.advogadoName}</b> defende-o (goste ou não).
            Meio minuto para os dois, em voz alta.
          </p>
          <button onClick={() => { sfx.click(); onAoVoto(); }} className="fd-btn fd-btn-primary">
            ⚖️ Ao voto
          </button>
        </>
      ) : (
        <>
          <VereditoBand veredito={round.veredito} room={room} youId={youId} onVota={onVota} />
          <p className="text-[11px] text-white/35">
            Se for absolvido, quem votou culpado bebe {round.custoCondenarMal}.
          </p>
        </>
      )}
    </CardShell>
  );
}

// ----- Contrato --------------------------------------------------------------

export function ContratoCard({ round, room, youId, canControl, onEscolhe, onAssina, onContinue }) {
  const souSpinner = round.currentPlayerId === youId;
  const naDupla = round.dupla.includes(youId);
  const jaDecidi = round.jaAssinaram.includes(youId);

  if (round.substate === 'result') {
    const r = round.result;
    return (
      <CardShell typeKey="contrato">
        <p className="text-lg leading-snug">{r.pacto}</p>
        <p className={`fd-title text-2xl font-extrabold ${r.feito ? 'text-emerald-300' : 'text-white/50'}`}>
          {r.feito ? '🤝 Assinado' : '✍️ O contrato caiu'}
        </p>
        {r.feito ? (
          <p className="text-sm text-white/60">
            {r.entre.map((p) => p.name).join(' e ')} ganham uma vida cada. Vale {r.duracao} jogadas —
            a mesa que fiscalize.
          </p>
        ) : (
          <p className="text-sm text-white/60">
            Bebem {r.custo}: {r.recusaram.map((p) => p.name).join(' e ') || 'ninguém'}.
          </p>
        )}
        <Continuar canControl={canControl} onContinue={onContinue} />
      </CardShell>
    );
  }

  if (round.substate === 'escolher') {
    return (
      <CardShell typeKey="contrato">
        <p className="text-sm text-white/50">O pacto proposto é:</p>
        <p className="text-lg leading-snug">{round.pacto}</p>
        {souSpinner ? (
          <>
            <p className="text-sm text-amber-300">Com quem queres pactuar?</p>
            <EscolheJogador room={room} exclui={[youId]} onPick={onEscolhe} />
          </>
        ) : (
          <p className="text-sm text-white/40">
            {round.currentPlayerName} está a escolher um parceiro…
          </p>
        )}
      </CardShell>
    );
  }

  return (
    <CardShell typeKey="contrato">
      <p className="text-sm text-white/50">
        <b className="text-white">{round.currentPlayerName}</b> +{' '}
        <b className="text-white">{round.parceiroName}</b>
      </p>
      <p className="text-lg leading-snug">{round.pacto}</p>
      <p className="text-sm text-white/45">
        Assinam os dois → uma vida para cada um, e o pacto vale {round.duracao} jogadas.
        Quem recusar bebe {round.custoRecusa}.
      </p>
      {naDupla && !jaDecidi ? (
        <div className="flex gap-3">
          <button onClick={() => { sfx.click(); onAssina(true); }} className="fd-btn fd-btn-success flex-1">
            ✍️ Assino
          </button>
          <button onClick={() => { sfx.click(); onAssina(false); }} className="fd-btn fd-btn-danger flex-1">
            🚫 Não assino
          </button>
        </div>
      ) : (
        <p className="text-sm text-cyan-300">
          {jaDecidi ? '🤫 Decisão guardada' : 'A ver se assinam…'}
        </p>
      )}
      <p className="text-[11px] text-white/35">
        {round.jaAssinaram.length} de 2 já decidiram
      </p>
    </CardShell>
  );
}
