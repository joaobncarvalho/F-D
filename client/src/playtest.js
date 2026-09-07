// F&D — SALA DE TESTE (playtest). Ferramenta de dev, não faz parte do jogo.
//
// O showroom (`?demo`) mostra os ecrãs com dados fictícios: vê-se o aspeto, não
// se testa a lógica. Isto é a outra metade — abrir a app REAL numa sala com
// bots, já dentro do jogo que se quer experimentar, e jogá-lo até ao fim.
//
// O contrato é o URL, para o showroom (e a /admin) só terem de abrir um link:
//
//   /?playtest=1&mode=wheel&tipo=tribunal&intensity=caos&bots=3
//   /?playtest=1&mode=board&casa=beerpong
//   /?playtest=1&mode=board&casa=mini&gameKey=isto_ou_aquilo
//
// Do lado do servidor isto é o evento `dev_playtest`, atrás do ENABLE_DEV_BOTS:
// sem essa variável a sala não se monta e a app diz porquê.

const params = new URLSearchParams(window.location.search);

/** A encomenda que veio no URL, ou null se isto não é um playtest. */
export const PLAYTEST = params.has('playtest')
  ? {
      mode: ['board', 'tournament', 'morte'].includes(params.get('mode')) ? params.get('mode') : 'wheel',
      intensity: ['leve', 'picante', 'hardcore', 'caos'].includes(params.get('intensity'))
        ? params.get('intensity')
        : 'caos', // o playtest quer ver TUDO: em leve há tipos que nem entram no sorteio
      bots: Math.max(1, Math.min(7, Number(params.get('bots')) || 3)),
      name: params.get('name') || 'Tu',
      gameTypeKey: params.get('tipo') || null,
      casa: params.get('casa') ? { kind: params.get('casa'), gameKey: params.get('gameKey') || null } : null,
    }
  : null;

/** Monta o link de uma sala de teste (usado pelos botões do showroom). */
export function linkPlaytest({ mode = 'wheel', tipo = null, casa = null, gameKey = null, intensity = 'caos', bots = 3 } = {}) {
  const p = new URLSearchParams({ playtest: '1', mode, intensity, bots: String(bots) });
  if (tipo) p.set('tipo', tipo);
  if (casa) p.set('casa', casa);
  if (gameKey) p.set('gameKey', gameKey);
  // Sai do `?demo` de propósito: o showroom vive dentro dele e o playtest é a
  // app a sério. Mesma origem, para funcionar dentro do iframe da /admin.
  return `${window.location.origin}${window.location.pathname}?${p}`;
}
