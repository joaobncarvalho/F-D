// F&D — barra da SALA DE TESTE (só aparece em `?playtest`, ver playtest.js).
//
// O que a barra resolve: dentro de um playtest, esperar que a roda calhe no
// jogo que se está a mexer é o mesmo problema que o showroom já tinha. Aqui
// encomenda-se o PRÓXIMO jogo (ou a próxima casa, no Tabuleiro) sem sair da
// sala — joga-se, vê-se o fim, e pede-se outro.
//
// A lista vem do servidor (`dev_catalogo`): uma segunda lista aqui era uma
// lista para ficar desatualizada no dia em que se acrescentasse um tipo.

import { useEffect, useState } from 'react';
import { socket } from '../socket.js';
import { sfx } from '../sfx.js';
import { bilhete } from '../playtest.js';

// Ritmo dos bots (o servidor tem os milissegundos, em socket.js → BOT_RITMOS).
// Uma mesa só de bots jogava depressa demais para se ver o que acontecia: a
// roda, os vereditos e os desafios passavam sem se perceber. Daqui abranda-se —
// ou põe-se em passo-a-passo, e nada anda sem se carregar em "passo".
const RITMOS = [
  { id: 'rapido', label: '⏩ rápido' },
  { id: 'normal', label: '▶️ normal' },
  { id: 'lento', label: '🐢 lento' },
  { id: 'manual', label: '👣 passo-a-passo' },
];

export default function PlaytestBar({ room, youId }) {
  const [aberto, setAberto] = useState(false);
  const [catalogo, setCatalogo] = useState(null); // { tipos, casas }
  const [erro, setErro] = useState(null);
  const [escolha, setEscolha] = useState('');
  const ritmo = room?.botRitmo || 'normal';

  const board = room?.mode === 'board';

  useEffect(() => {
    if (!aberto || catalogo) return;
    socket.emit('dev_catalogo', { ticket: bilhete() }, (r) => {
      if (r?.ok) setCatalogo({ tipos: r.tipos || [], casas: r.casas || [] });
      else setErro(r?.message || 'Não deu para ler o catálogo.');
    });
  }, [aberto, catalogo]);

  // O que está encomendado, tal como o servidor o vê (serializeGame/serializeBoard).
  const emEspera = board ? room?.board?.casaForcada : room?.game?.tipoForcado;
  const rotuloEspera = board
    ? emEspera && (catalogo?.casas.find((c) => c.kind === emEspera.kind && (c.gameKey || null) === (emEspera.gameKey || null))?.label || emEspera.kind)
    : emEspera && (catalogo?.tipos.find((t) => t.key === emEspera)?.label || emEspera);

  const opcoes = board
    ? (catalogo?.casas || []).map((c) => ({ id: `${c.kind}:${c.gameKey || ''}`, label: c.label }))
    : (catalogo?.tipos || []).map((t) => ({ id: t.key, label: t.label }));

  function encomenda(id) {
    if (!id) return;
    sfx.click();
    setEscolha(id);
    setErro(null);
    const payload = board
      ? { casa: { kind: id.split(':')[0], gameKey: id.split(':')[1] || null }, ticket: bilhete() }
      : { gameTypeKey: id, ticket: bilhete() };
    socket.emit('dev_force_next', payload, (r) => {
      if (!r?.ok) setErro(r?.message || 'Não deu para encomendar.');
    });
  }

  function mudaRitmo(id) {
    sfx.click();
    setErro(null);
    socket.emit('dev_bot_ritmo', { ritmo: id, ticket: bilhete() }, (r) => {
      if (!r?.ok) setErro(r?.message || 'Não deu para mudar o ritmo.');
    });
  }

  function passo() {
    sfx.click();
    socket.emit('dev_bot_step', { ticket: bilhete() }, (r) => {
      if (!r?.ok) setErro(r?.message || 'Não deu para dar o passo.');
    });
  }

  const eu = room?.players?.find((p) => p.id === youId);
  const daVez = board ? room?.board?.currentPlayerId === youId : room?.game?.currentPlayerId === youId;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      <div className="mx-auto max-w-md p-3 pointer-events-auto">
        {aberto && (
          <div className="fd-card p-3 mb-2 flex flex-col gap-2 border border-dashed border-fuchsia-400/40">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">🧪 Sala de teste · {room?.code}</span>
              <button onClick={() => setAberto(false)} className="text-white/50 text-lg leading-none">✕</button>
            </div>

            <p className="text-[11px] text-white/45">
              {board
                ? 'Encomenda a casa onde o teu próximo lançamento vai cair. Vale uma vez, e só para ti.'
                : 'Encomenda o jogo da tua próxima volta à roda. Vale uma vez, e só para ti.'}
            </p>

            {/* Lista da própria app, e não um <select>: o menu nativo abre-se com
                as cores do sistema (fundo branco) por baixo do texto branco da
                app, e ficava ilegível. Aqui também poupa dois toques — carregar
                num jogo É encomendá-lo. */}
            {!catalogo && !erro && <p className="text-[11px] text-white/40 py-2">a carregar os jogos…</p>}
            <div className="grid grid-cols-2 gap-1.5 max-h-[38vh] overflow-y-auto pr-0.5">
              {opcoes.map((o) => (
                <button
                  key={o.id}
                  onClick={() => encomenda(o.id)}
                  className={`fd-chip text-left text-xs leading-tight py-2 ${escolha === o.id ? 'fd-chip-on' : ''}`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {/* Ritmo dos bots: o que faz a diferença entre ver o jogo e ver o
                resultado dele. Fica por cima da encomenda porque é o que se
                mexe primeiro quando se abre a barra a meio de uma volta. */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/10">
              <span className="text-[11px] text-white/45 w-full">Ritmo dos bots</span>
              {RITMOS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => mudaRitmo(r.id)}
                  className={`fd-chip text-[11px] py-1.5 ${ritmo === r.id ? 'fd-chip-on' : ''}`}
                >
                  {r.label}
                </button>
              ))}
              {ritmo === 'manual' && (
                <button onClick={passo} className="fd-chip fd-chip-on text-[11px] py-1.5 ml-auto">
                  👉 passo
                </button>
              )}
            </div>

            {emEspera && (
              <p className="text-[11px] text-fuchsia-200/80">
                📌 À espera: <b>{rotuloEspera}</b>{' '}
                {daVez
                  ? board ? '— lança o dado' : '— gira a roda'
                  : '— sai quando for a tua vez'}
              </p>
            )}
            {erro && <p className="text-[11px] text-rose-300">{erro}</p>}

            <p className="text-[11px] text-white/35">
              {(room?.players || []).filter((p) => p.isBot).length} bots a jogar contigo
              {eu ? ` · ${eu.lives} vidas` : ''}. Fechar o separador acaba a sala.
            </p>
          </div>
        )}

        {!aberto && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { sfx.click(); setAberto(true); }}
              className="fd-card px-3 py-2 text-xs font-bold border border-dashed border-fuchsia-400/40"
            >
              🧪 sala de teste{ritmo === 'lento' ? ' · 🐢' : ''}{ritmo === 'manual' ? ' · 👣' : ''}{emEspera ? ' · 📌' : ''}
            </button>
            {/* No passo-a-passo o jogo está parado à espera deste botão — tem de
                estar à mão sem abrir a barra. */}
            {ritmo === 'manual' && (
              <button
                onClick={passo}
                className="fd-card px-3 py-2 text-xs font-bold border border-dashed border-fuchsia-400/40"
              >
                👉 passo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
