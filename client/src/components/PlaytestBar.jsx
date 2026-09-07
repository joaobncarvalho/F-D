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

export default function PlaytestBar({ room, youId }) {
  const [aberto, setAberto] = useState(false);
  const [catalogo, setCatalogo] = useState(null); // { tipos, casas }
  const [erro, setErro] = useState(null);
  const [escolha, setEscolha] = useState('');

  const board = room?.mode === 'board';

  useEffect(() => {
    if (!aberto || catalogo) return;
    socket.emit('dev_catalogo', {}, (r) => {
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

  function encomenda() {
    if (!escolha) return;
    sfx.click();
    const payload = board
      ? { casa: { kind: escolha.split(':')[0], gameKey: escolha.split(':')[1] || null } }
      : { gameTypeKey: escolha };
    socket.emit('dev_force_next', payload, (r) => {
      if (!r?.ok) setErro(r?.message || 'Não deu para encomendar.');
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

            <div className="flex gap-2">
              <select
                value={escolha}
                onChange={(e) => setEscolha(e.target.value)}
                className="fd-chip flex-1 min-w-0 text-sm bg-black/40"
              >
                <option value="">{catalogo ? '— escolhe —' : 'a carregar…'}</option>
                {opcoes.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <button onClick={encomenda} disabled={!escolha} className="fd-btn fd-btn-primary text-sm px-3">
                Encomendar
              </button>
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
          <button
            onClick={() => { sfx.click(); setAberto(true); }}
            className="fd-card px-3 py-2 text-xs font-bold border border-dashed border-fuchsia-400/40"
          >
            🧪 sala de teste{emEspera ? ' · 📌' : ''}
          </button>
        )}
      </div>
    </div>
  );
}
