// F&D — a segunda camada da ronda (palpites da plateia).
//
// O invariante que sustenta a mecânica inteira é o do SEGREDO: se os palpites
// se vissem antes de fechar, apostava toda a gente no mesmo e a aposta deixava
// de ser aposta. É o mesmo motivo por que as apostas do Torneio são secretas.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
process.env.SNAPSHOT = '0';
// Este ficheiro mede goles ao golo; um Evento da Noite a cair a meio somava
// bebidas a toda a mesa e partia as contas (ver game/eventos.js).
process.env.EVENTOS = '0';

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const palpites = await import('../src/game/palpites.js');

function mesa(nomes = ['Ana', 'Rui', 'Zé', 'Nel']) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(nomes[0]);
  const jogadores = [host];
  for (const nome of nomes.slice(1)) jogadores.push(rm.joinRoom(room.code, nome).player);
  rm.startGame(room.code, host.id);
  game.initGame(room, { lives: 3 });
  game.beginPlay(room, host.id);
  return { rm, room, jogadores };
}

/**
 * Gira até sair um tipo que tenha palpites (a roda é aleatória).
 *
 * Salta os prompts com BUDDY. Não é conveniência: um prompt de buddy exige uma
 * escolha antes de o jogador poder aceitar ou recusar, e este ficheiro é sobre
 * palpites — a ronda que ele quer é a mais simples possível. Sem isto, o teste
 * falhava de vez em quando com "Escolhe primeiro o teu buddy 🤝", à sorte do
 * prompt que calhava (uma falha em cada doze corridas, e mais desde que a roda
 * passou a ter 24 tipos).
 */
async function giraAte(room, chaves, tentativas = 800) {
  const g = room.game;
  for (let i = 0; i < tentativas; i++) {
    const round = await game.spinWheel(room, g.currentPlayerId);
    if (chaves.includes(round.gameTypeKey) && !round.needsBuddy) return round;
    g.round = null;
    g.phase = 'wheel';
  }
  throw new Error(`a roda nunca calhou em ${chaves.join('/')}`);
}

test('a ronda de um jogador só abre palpites para os OUTROS', async () => {
  const { room } = mesa();
  const round = await giraAte(room, ['desafio', 'boca_calada']);

  assert.ok(round.palpite, 'um tipo de holofote tem de abrir a camada');
  assert.ok(
    round.palpite.excluidos.includes(round.currentPlayerId),
    'quem está a jogar a ronda não aposta em si próprio'
  );
  assert.throws(
    () => game.darPalpite(room, round.currentPlayerId, 'aceita'),
    /não podes apostar/i
  );
});

test('os palpites são secretos até fecharem', async () => {
  // A formulação forte do invariante: TROCAR os palpites de toda a gente não
  // pode mudar uma vírgula do que vai para a mesa. Procurar a string "aceita"
  // no payload não servia — as CHAVES das opções têm de lá estar, senão o
  // cliente não tinha em que carregar.
  async function payloadCom(escolhas) {
    const { room, jogadores } = mesa();
    const round = await giraAte(room, ['desafio', 'boca_calada']);
    const plateia = jogadores.filter((p) => p.id !== round.currentPlayerId);
    // Ordem de entrada estável → os ids não entram na comparação por acaso.
    plateia.forEach((p, i) => game.darPalpite(room, p.id, escolhas[i]));
    const pal = serializeRoom(room).game.round.palpite;
    // Fora da comparação: os ids são de salas diferentes e o tipo pode não ser o
    // mesmo em duas voltas da roda. O que se compara é o que a aposta produz.
    return JSON.stringify({
      ...pal,
      excluidos: pal.excluidos.length,
      jaApostaram: pal.jaApostaram.length,
      pergunta: undefined,
      opcoes: undefined,
    });
  }

  const a = await payloadCom(['aceita', 'bebe', 'aceita']);
  const b = await payloadCom(['bebe', 'aceita', 'bebe']);
  assert.equal(a, b, 'o estado da sala não pode denunciar o palpite de ninguém');

  // Quem já apostou é público (como o "3/4" dos jogos de grupo) — isso não
  // estraga nada e poupa um canal privado só para o botão saber que já foi.
  const { room, jogadores } = mesa();
  const round = await giraAte(room, ['desafio', 'boca_calada']);
  const plateia = jogadores.filter((p) => p.id !== round.currentPlayerId);
  game.darPalpite(room, plateia[0].id, 'aceita');
  const p = serializeRoom(room).game.round.palpite;
  assert.deepEqual(p.jaApostaram, [plateia[0].id]);
  assert.ok(!('apostas' in p), 'o mapa jogador→palpite nunca é serializado');
});

test('quem erra o palpite bebe; quem acerta não', async () => {
  const { room, jogadores } = mesa();
  const round = await giraAte(room, ['desafio', 'boca_calada']);
  const plateia = jogadores.filter((p) => p.id !== round.currentPlayerId);

  game.darPalpite(room, plateia[0].id, 'aceita'); // vai acertar
  game.darPalpite(room, plateia[1].id, 'bebe'); // vai errar
  // O terceiro não aposta: quem não joga não pode ser castigado.

  const antes = plateia.map((p) => room.game.stats[p.id]?.drinks || 0);
  game.resolveAction(room, round.currentPlayerId, 'accept');

  const stats = room.game.stats;
  assert.equal(stats[plateia[0].id]?.drinks || 0, antes[0], 'quem acertou não bebe');
  assert.equal(
    (stats[plateia[1].id]?.drinks || 0) - antes[1],
    palpites.GOLOS_ERRADO,
    'quem errou paga o mesmo que no Torneio'
  );
  assert.equal(stats[plateia[2].id]?.drinks || 0, antes[2], 'quem não apostou fica de fora');
});

test('depois de resolver, o resultado e as listas ficam públicos', async () => {
  const { room, jogadores } = mesa();
  const round = await giraAte(room, ['desafio', 'boca_calada']);
  const plateia = jogadores.filter((p) => p.id !== round.currentPlayerId);
  game.darPalpite(room, plateia[0].id, 'bebe');
  game.resolveAction(room, round.currentPlayerId, 'refuse');

  const p = serializeRoom(room).game.round.palpite;
  assert.equal(p.resolvido, true);
  assert.equal(p.resultado, 'bebe');
  assert.equal(p.certos.length, 1, 'apostou em beber e o jogador bebeu');
  assert.equal(p.certos[0].name, plateia[0].name);
});

test('não se aposta duas vezes nem depois de fechar', async () => {
  const { room, jogadores } = mesa();
  const round = await giraAte(room, ['desafio', 'boca_calada']);
  const alguem = jogadores.find((p) => p.id !== round.currentPlayerId);

  game.darPalpite(room, alguem.id, 'aceita');
  assert.throws(() => game.darPalpite(room, alguem.id, 'bebe'), /já deste/i);

  game.resolveAction(room, round.currentPlayerId, 'accept');
  const outro = jogadores.find((p) => p.id !== round.currentPlayerId && p.id !== alguem.id);
  assert.throws(() => game.darPalpite(room, outro.id, 'aceita'), /fecharam/i);
});

test('Isto ou Aquilo: aposta-se nas opções do próprio dilema', async () => {
  const { room, jogadores } = mesa();
  const round = await giraAte(room, ['isto_ou_aquilo']);
  const plateia = jogadores.filter((p) => p.id !== round.currentPlayerId);

  assert.equal(round.palpite.opcoes.length, 2);
  assert.equal(round.palpite.opcoes[0].rotulo, round.options[0], 'a aposta é no texto real da opção');

  game.darPalpite(room, plateia[0].id, '1');
  game.chooseOption(room, round.currentPlayerId, 1);

  const p = serializeRoom(room).game.round.palpite;
  assert.equal(p.resolvido, true);
  assert.equal(p.certos.length, 1);
});

test('os tipos de mesa inteira NÃO abrem palpites', () => {
  // Já têm toda a gente a jogar; uma aposta por cima competia com o próprio jogo.
  for (const key of ['eu_nunca', 'segredos', 'vasco', 'quem_disse', 'cascata', 'mimica', 'desenho']) {
    assert.equal(palpites.temPalpite(key), false, `${key} não devia abrir palpites`);
  }
  for (const key of ['desafio', 'boca_calada', 'isto_ou_aquilo', 'roleta_russa', 'categoria_relampago']) {
    assert.equal(palpites.temPalpite(key), true, `${key} devia abrir palpites`);
  }
});
