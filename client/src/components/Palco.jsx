// F&D — o PALCO (parte visível). A fila e as regras estão em ../palco.js.
//
// Um único sítio na app onde as encenações de ecrã inteiro montam, e uma de cada
// vez. Antes disto cada uma montava onde vivia — o Evento e a Regra no App, a
// Maldição e a Ganância no Board — e duas ao mesmo tempo era exatamente isso:
// duas ao mesmo tempo, uma por cima da outra.
//
// Acrescentar uma encenação nova é acrescentar uma linha ao mapa CENAS e chamar
// `encena('id-do-momento', { tipo, ... })` de onde ela nasce.

import { AnimatePresence, motion } from 'framer-motion';
import { cloneElement, useEffect, useState } from 'react';
import EventoDaNoite from './EventoDaNoite.jsx';
import RegraNova from './RegraNova.jsx';
import MaldicaoOverlay from '../pages/board/MaldicaoOverlay.jsx';
import GananciaOverlay from '../pages/board/GananciaOverlay.jsx';
import { CardPlayReveal, OrderReveal } from '../pages/board/reveals.jsx';
import { useCena, fecha } from '../palco.js';
import { sfx } from '../sfx.js';

/**
 * tipo da cena -> como se desenha.
 *
 * O `fim` que cada uma recebe já NÃO é "desaparece": é "acabei a encenação".
 * Quem sai do ecrã é o toque de quem está a ler (ver palco.js). As cenas não
 * precisaram de saber disto — continuam a chamar `onDone` no mesmo sítio.
 */
const CENAS = {
  evento: (c, fim) => <EventoDaNoite evento={c.evento} onDone={fim} />,
  regra: (c, fim) => <RegraNova regra={c.regra} onDone={fim} />,
  maldicao: (c, fim) => <MaldicaoOverlay trap={c.trap} onDone={fim} />,
  carta: (c, fim) => <CardPlayReveal card={c.card} onDone={fim} />,
  ganancia: (c, fim) => <GananciaOverlay greed={c.greed} onDone={fim} />,
  ordem: (c, fim) => (
    <OrderReveal data={c.data} players={c.players} boardPlayers={c.boardPlayers} onClose={fim} />
  ),
};

export default function Palco() {
  const { cena, espera } = useCena();
  // A encenação já correu? Só então aparece o convite para sair — mostrá-lo à
  // entrada era pedir para o fecharem antes de a carta acabar de virar.
  const [encenada, setEncenada] = useState(false);
  useEffect(() => {
    setEncenada(false);
  }, [cena?.id]);

  // O som de entrada da cena (as que o têm) toca aqui e não em quem encenou:
  // encenar é só pôr na fila, e entre isso e o ecrã pode passar-se meio minuto.
  useEffect(() => {
    if (cena?.som) sfx[cena.som]?.();
  }, [cena?.id]);

  const desenha = cena && CENAS[cena.tipo];
  const acabou = (id) => {
    const c = cena;
    if (c?.fechaSozinha) fecha(id);
    else setEncenada(true);
  };
  const podeFechar = !!cena && !cena.fechaSozinha && encenada;

  return (
    <>
      <AnimatePresence>
        {/* A chave é o id do MOMENTO (e vai no próprio overlay, para o
            AnimatePresence lhe poder animar a saída): garante que a cena
            anterior desmonta antes de a seguinte montar, mesmo do mesmo tipo. */}
        {desenha && cloneElement(CENAS[cena.tipo](cena, () => acabou(cena.id)), { key: cena.id })}
      </AnimatePresence>

      {/* A saída. O ecrã inteiro aceita o toque (é o gesto que uma mesa faz sem
          pensar) e a pastilha diz que é preciso fazê-lo. Fica POR CIMA da cena
          — as encenações são todas `pointer-events-none`, senão nem se podiam
          fechar. */}
      <AnimatePresence>
        {podeFechar && (
          <motion.button
            key="sair"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.35 }}
            onClick={() => fecha(cena.id)}
            aria-label="Continuar"
            className="fixed inset-0 z-[72] flex items-end justify-center pb-[14vh] px-6 cursor-pointer"
          >
            <motion.span
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ opacity: { duration: 2.2, repeat: Infinity } }}
              className="rounded-full px-5 py-2.5 text-sm font-bold"
              style={{
                background: 'rgba(10,8,16,0.82)',
                border: '1px solid rgba(255,255,255,0.22)',
                backdropFilter: 'blur(4px)',
              }}
            >
              toca para continuar{espera > 0 ? ` · +${espera}` : ''}
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Há mais para ver a seguir. Sem isto, uma cena que fica em fila parece
          que se perdeu — e é precisamente quando há duas que isto importa. */}
      <AnimatePresence>
        {espera > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed left-1/2 -translate-x-1/2 top-3 z-[71] pointer-events-none rounded-full px-3 py-1 text-[11px] font-bold"
            style={{ background: 'rgba(8,6,14,0.8)', border: '1px solid rgba(255,255,255,0.14)' }}
          >
            +{espera} a seguir
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

