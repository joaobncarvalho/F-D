// F&D — telemetria: o que a mesa REALMENTE fez com o conteúdo.
//
// O PROBLEMA
//
// A /admin deixa escrever e editar prompts há semanas, e não tem forma nenhuma de
// saber se algum deles presta. Escreve-se um desafio, mete-se na roda, e a partir
// daí ninguém volta a saber se saiu, se foi aceite, ou se toda a gente que o
// apanhou preferiu beber. Todas as decisões de conteúdo — o que reescrever, o que
// apagar, se a curva de intensidade está calibrada, se um tipo novo pega — estão
// a ser tomadas de memória, por quem estava na festa.
//
// Pôr "estatísticas" na admin sem recolher nada seria decorar a página. Isto é a
// recolha.
//
// O QUE SE GUARDA — E O QUE NÃO SE GUARDA
//
// Só CONTADORES AGREGADOS. Nunca quem fez o quê. Não é escrúpulo decorativo: é o
// mesmo princípio que faz as Intrigas serem anónimas no payload de rede e que faz
// o `game.secrets` nunca sair do servidor. Um ficheiro que dissesse "a Ana
// recusou o desafio X às 2h14" é exatamente aquilo que este jogo passou o tempo
// todo a não fazer, e não vale nenhuma estatística. Por isso:
//
//   · não há nomes, ids de jogador, códigos de sala nem texto escrito por
//     jogadores (perguntas, segredos, intrigas — o conteúdo da mesa);
//   · há contagens por PROMPT (que é conteúdo NOSSO, escrito na admin), por tipo
//     da roda, por intensidade, e por regra da noite;
//   · a lista de noites guarda forma (modo, nº de pessoas, rondas, minutos, como
//     acabou) — não guarda quem lá estava.
//
// ONDE VIVE
//
// Contadores em memória, gravados de tempos a tempos — nunca no caminho crítico
// de uma ronda (Regra de Ouro nº 2: o estado quente é em memória por causa da
// latência). Dois destinos, pela mesma razão que o snapshot.js tem dois:
//
//   · ficheiro (`.data/telemetria.json`) — sempre disponível, e é o que salva um
//     playtest em casa sem Supabase ligada. É a fonte de verdade em runtime.
//   · Postgres (`telemetry_counters` + `telemetry_nights`) — o ÚNICO que
//     sobrevive a um deploy que troque de máquina. Sem a tabela criada
//     (`db/04_telemetria.sql`) isto degrada em silêncio para só-ficheiro, como o
//     snapshot já faz: nunca impede o servidor de arrancar.
//
// Desliga-se com TELEMETRIA=0.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prismaClient } from './repo.js';
import { log } from './log.js';

const DEFAULT_FILE = fileURLToPath(new URL('../.data/telemetria.json', import.meta.url));
const FILE = process.env.TELEMETRIA_FILE || DEFAULT_FILE;
const FILE_EVERY_MS = Number(process.env.TELEMETRIA_EVERY_MS) || 20000;
const DB_EVERY_MS = Number(process.env.TELEMETRIA_DB_EVERY_MS) || 120000;

// Quantas noites se guardam na lista. É uma janela, não um arquivo: o que
// interessa é "as últimas festas", e uma lista infinita só engorda o ficheiro.
const MAX_NOITES = 300;

export const ENABLED = process.env.TELEMETRIA !== '0';

/**
 * O estado. `counters` é `scope -> key -> { metrics, label }`, propositadamente
 * genérico: acrescentar uma métrica nova não precisa de migração nenhuma, o que
 * é o que permite isto crescer com o jogo em vez de travar nele.
 */
const estado = {
  desde: Date.now(),
  counters: new Map(),
  noites: [],
  sujo: false,
};

// ----- Escrita ----------------------------------------------------------------

function balde(scope, key) {
  const s = estado.counters.get(scope) || new Map();
  estado.counters.set(scope, s);
  const b = s.get(key) || { metrics: {}, label: null };
  s.set(key, b);
  return b;
}

/**
 * Soma `n` a uma métrica. É a única porta de entrada — tudo o resto do ficheiro
 * (e do jogo) passa por aqui, e por isso o interruptor TELEMETRIA=0 chega para
 * garantir que nada é recolhido.
 */
export function conta(scope, key, metric, n = 1, label = null) {
  if (!ENABLED || !scope || !key || !metric) return;
  const b = balde(scope, String(key));
  b.metrics[metric] = (b.metrics[metric] || 0) + n;
  if (label && !b.label) b.label = String(label).slice(0, 160);
  estado.sujo = true;
}

/**
 * Chave estável de um prompt.
 *
 * Nem sempre há id: em modo ficheiro (`content/prompts.data.js`) os prompts não
 * têm um, e mesmo com BD um prompt editado na admin passa a ser outro texto. O
 * hash do par (tipo, texto) é a única chave que significa a mesma coisa nos dois
 * mundos — e é ela que faz uma reescrita começar a contar do zero, que é o que
 * se quer: o prompt velho e o novo não são o mesmo desafio.
 */
export function chaveDePrompt(gameTypeKey, texto) {
  return crypto
    .createHash('sha1')
    .update(`${gameTypeKey}|${String(texto || '').trim()}`)
    .digest('hex')
    .slice(0, 12);
}

// ----- Os factos que o jogo comunica -------------------------------------------
//
// Uma função por acontecimento, e não `conta()` espalhado pelo game.js: assim a
// FORMA dos dados vive toda aqui, e mudar o que se mede não obriga a mexer no
// motor. Todas aceitam a ronda tal como o motor a tem, para o chamador não ter
// de saber que campos é que a telemetria quer.

/**
 * O texto da ronda, mas SÓ se for conteúdo nosso.
 *
 * Três tipos põem em `round.prompt` texto escrito pela própria mesa: o Boca
 * Calada quando usa uma pergunta da preparação, o Quem Disse, e os Segredos.
 * Esses vêm marcados com `promptDaMesa` na origem, e param aqui — contá-los
 * seria guardar o que alguém escreveu sobre outra pessoa numa festa, que é
 * exatamente o que este ficheiro promete não fazer. O TIPO continua a contar;
 * o texto é que não.
 */
function textoNosso(round) {
  if (round.promptDaMesa) return null;
  return round.prompt?.text || null;
}

/** A roda parou: um tipo saiu, e talvez com um prompt nosso. */
export function rondaAbriu(round, intensidade) {
  if (!ENABLED || !round) return;
  conta('tipo', round.gameTypeKey, 'saiu');
  if (intensidade) conta('intensidade', intensidade, 'saiu');
  const texto = textoNosso(round);
  if (texto) {
    conta('prompt', chaveDePrompt(round.gameTypeKey, texto), 'visto', 1, `${round.gameTypeKey} · ${texto}`);
  }
}

/**
 * A ronda fechou-se com uma decisão de quem estava à vez.
 *
 * `desfecho` é 'aceite' | 'recusado' | 'saltado'. O cruzamento com as regras da
 * noite (`modifiers`) é o que responde à pergunta que o sorteio dos modificadores
 * deixou em aberto: o Sem Escape faz mesmo alguém aceitar o que não aceitaria?
 * Sem o lado `:off` não havia com o que comparar, e uma taxa sozinha não diz nada.
 */
export function rondaFechou(round, { intensidade, desfecho, modifiers = [], catalogo = [] } = {}) {
  if (!ENABLED || !round || !desfecho) return;
  conta('tipo', round.gameTypeKey, desfecho);
  if (intensidade) conta('intensidade', intensidade, desfecho);
  const texto = textoNosso(round);
  if (texto) {
    conta('prompt', chaveDePrompt(round.gameTypeKey, texto), desfecho, 1, `${round.gameTypeKey} · ${texto}`);
  }
  if (desfecho === 'saltado') return; // saltar não é uma decisão do jogador
  for (const key of catalogo) {
    conta('regra_efeito', `${key}:${modifiers.includes(key) ? 'on' : 'off'}`, desfecho);
  }
}

/** Uma regra da noite entrou em vigor ('arranque' ou 'meio'), ou saiu. */
export function regra(key, momento) {
  conta('regra', key, momento);
}

/** O que o host cortou antes de começar (só uma vez por noite, no start_game). */
export function vetos(lista = []) {
  for (const k of lista) conta('regra', k, 'vetada');
}

/**
 * Uma noite acabou. `outcome` é 'fim' (chegou ao fim de jogo) ou 'abandonada'
 * (a sala esvaziou-se a meio) — e é a diferença entre as duas que interessa: uma
 * noite abandonada à oitava ronda é o sinal mais importante que este jogo pode
 * dar, e é o único que nenhum ecrã de fim de jogo alguma vez mostrou a ninguém.
 */
export function noiteAcabou({
  modo = 'wheel',
  intensidade = null,
  jogadores = 0,
  rondas = 0,
  minutos = 0,
  outcome = 'fim',
  modifiers = [],
  eliminados = 0,
  goles = 0,
} = {}) {
  if (!ENABLED) return;
  const n = {
    em: Date.now(),
    modo,
    intensidade,
    jogadores,
    rondas,
    minutos: Math.round(minutos),
    outcome,
    modifiers: [...modifiers],
    eliminados,
    goles,
  };
  estado.noites.push(n);
  if (estado.noites.length > MAX_NOITES) estado.noites.splice(0, estado.noites.length - MAX_NOITES);

  conta('noite', 'total', 'n');
  conta('noite', 'total', 'rondas', rondas);
  conta('noite', 'total', 'minutos', n.minutos);
  conta('noite', 'total', 'jogadores', jogadores);
  conta('noite', 'total', 'goles', goles);
  conta('noite', `modo:${modo}`, 'n');
  conta('noite', `outcome:${outcome}`, 'n');
  if (intensidade) conta('noite', `intensidade:${intensidade}`, 'n');
  estado.sujo = true;
  return n;
}

// ----- Leitura: o resumo que a /admin mostra -----------------------------------

const metricasDe = (scope, key) => estado.counters.get(scope)?.get(key)?.metrics || {};

const linhas = (scope) =>
  [...(estado.counters.get(scope) || new Map()).entries()].map(([key, b]) => ({
    key,
    label: b.label,
    ...b.metrics,
  }));

/** Taxa de recusa em percentagem, ou null quando a amostra é pequena de mais. */
function taxaRecusa(row, minimo = 1) {
  const decididos = (row.aceite || 0) + (row.recusado || 0);
  if (decididos < minimo) return null;
  return Math.round(((row.recusado || 0) / decididos) * 100);
}

/**
 * O retrato completo, já calculado no servidor.
 *
 * Calculado aqui e não no browser de propósito: as regras de leitura (o que é
 * uma amostra suficiente, o que conta como "morto") são decisões de produto, e
 * decisões de produto escritas em JavaScript de página não têm testes.
 */
export function resumo({ minAmostra = 4 } = {}) {
  const prompts = linhas('prompt').map((r) => ({
    ...r,
    visto: r.visto || 0,
    aceite: r.aceite || 0,
    recusado: r.recusado || 0,
    saltado: r.saltado || 0,
    taxaRecusa: taxaRecusa(r),
  }));
  const tipos = linhas('tipo').map((r) => ({
    ...r,
    saiu: r.saiu || 0,
    aceite: r.aceite || 0,
    recusado: r.recusado || 0,
    saltado: r.saltado || 0,
    taxaRecusa: taxaRecusa(r),
    // Quantas vezes o tipo saiu e ninguém decidiu nada (o host saltou, ou a
    // ronda morreu). Um tipo com muito disto é um tipo que a mesa não percebe.
    taxaSalto: r.saiu ? Math.round(((r.saltado || 0) / r.saiu) * 100) : null,
  }));
  const intensidades = ['leve', 'picante', 'hardcore', 'caos'].map((key) => {
    const r = metricasDe('intensidade', key);
    return { key, saiu: r.saiu || 0, aceite: r.aceite || 0, recusado: r.recusado || 0, taxaRecusa: taxaRecusa(r) };
  });

  // O efeito de cada regra: taxa de recusa com ela ligada vs. desligada. É a
  // única leitura aqui que mede uma MECÂNICA e não conteúdo.
  const regrasKeys = new Set(
    [...(estado.counters.get('regra_efeito') || new Map()).keys()].map((k) => k.split(':')[0])
  );
  for (const k of (estado.counters.get('regra') || new Map()).keys()) regrasKeys.add(k);
  const regras = [...regrasKeys].map((key) => {
    const on = metricasDe('regra_efeito', `${key}:on`);
    const off = metricasDe('regra_efeito', `${key}:off`);
    const uso = metricasDe('regra', key);
    return {
      key,
      arranque: uso.arranque || 0,
      meio: uso.meio || 0,
      vetada: uso.vetada || 0,
      expirou: uso.expirou || 0,
      comRondas: (on.aceite || 0) + (on.recusado || 0),
      semRondas: (off.aceite || 0) + (off.recusado || 0),
      recusaCom: taxaRecusa(on, minAmostra),
      recusaSem: taxaRecusa(off, minAmostra),
    };
  });

  const tot = metricasDe('noite', 'total');
  const noites = tot.n || 0;
  const porChave = (prefixo) =>
    [...(estado.counters.get('noite') || new Map()).entries()]
      .filter(([k]) => k.startsWith(prefixo))
      .map(([k, b]) => ({ key: k.slice(prefixo.length), n: b.metrics.n || 0 }))
      .sort((a, b) => b.n - a.n);

  return {
    desde: estado.desde,
    ligada: ENABLED,
    noites: {
      total: noites,
      mediaRondas: noites ? +((tot.rondas || 0) / noites).toFixed(1) : 0,
      mediaMinutos: noites ? +((tot.minutos || 0) / noites).toFixed(1) : 0,
      mediaJogadores: noites ? +((tot.jogadores || 0) / noites).toFixed(1) : 0,
      mediaGoles: noites ? +((tot.goles || 0) / noites).toFixed(1) : 0,
      porModo: porChave('modo:'),
      porOutcome: porChave('outcome:'),
      porIntensidade: porChave('intensidade:'),
      recentes: [...estado.noites].reverse().slice(0, 40),
    },
    prompts,
    tipos,
    intensidades,
    regras,
    minAmostra,
  };
}

/** As contagens de um prompt concreto (a admin cruza isto com a lista da BD). */
export function porPrompt(gameTypeKey, texto) {
  const m = metricasDe('prompt', chaveDePrompt(gameTypeKey, texto));
  const row = {
    visto: m.visto || 0,
    aceite: m.aceite || 0,
    recusado: m.recusado || 0,
    saltado: m.saltado || 0,
  };
  return { ...row, taxaRecusa: taxaRecusa(row) };
}

/** Apaga tudo (a admin oferece isto antes de um playtest: contagem limpa). */
export async function limpa({ prisma } = {}) {
  estado.counters = new Map();
  estado.noites = [];
  estado.desde = Date.now();
  estado.sujo = true;
  try {
    fs.rmSync(FILE, { force: true });
  } catch {
    /* o ficheiro pode nem existir */
  }
  const p = prisma || (await prismaClient());
  if (p) {
    try {
      await p.$transaction([p.telemetryCounter.deleteMany({}), p.telemetryNight.deleteMany({})]);
    } catch {
      /* sem tabela: o ficheiro é que manda */
    }
  }
}

// ----- Persistência ------------------------------------------------------------

function toPlain() {
  const counters = [];
  for (const [scope, mapa] of estado.counters) {
    for (const [key, b] of mapa) counters.push({ scope, key, label: b.label, metrics: b.metrics });
  }
  return { desde: estado.desde, counters, noites: estado.noites };
}

function fromPlain(plain) {
  if (!plain) return;
  estado.desde = plain.desde || Date.now();
  estado.counters = new Map();
  for (const row of plain.counters || []) {
    const b = balde(row.scope, row.key);
    b.label = row.label || b.label;
    for (const [m, v] of Object.entries(row.metrics || {})) b.metrics[m] = (b.metrics[m] || 0) + v;
  }
  estado.noites = (plain.noites || []).slice(-MAX_NOITES);
}

/**
 * Este Prisma client conhece as tabelas da telemetria?
 *
 * Não basta haver BD: enquanto o `db/04_telemetria.sql` (ou o `prisma db push`)
 * não correr, o client gerado não tem estes modelos. Verificar aqui em vez de
 * deixar rebentar evita um aviso a cada arranque por uma coisa que é esperada —
 * o ficheiro continua a ser a fonte de verdade, e a BD entra quando existir.
 */
function temTabelas(p) {
  return !!p?.telemetryCounter && !!p?.telemetryNight;
}

export function saveFile() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(toPlain()));
    fs.renameSync(tmp, FILE); // troca atómica: nunca deixa um ficheiro meio escrito
    return true;
  } catch (e) {
    log.warn('telemetria: falhou a gravação no ficheiro', { message: e.message });
    return false;
  }
}

export function loadFile() {
  try {
    if (!fs.existsSync(FILE)) return false;
    fromPlain(JSON.parse(fs.readFileSync(FILE, 'utf8')));
    return true;
  } catch (e) {
    log.warn('telemetria: ficheiro ilegível, começo do zero', { message: e.message });
    return false;
  }
}

export async function saveDb(prisma) {
  const p = prisma || (await prismaClient());
  if (!temTabelas(p)) return false;
  try {
    const plain = toPlain();
    // Um upsert por contador. São dezenas, não milhares, e correm de dois em dois
    // minutos — não vale a pena um SQL à mão para isto.
    for (const c of plain.counters) {
      await p.telemetryCounter.upsert({
        where: { scope_key: { scope: c.scope, key: c.key } },
        create: { scope: c.scope, key: c.key, label: c.label, metrics: c.metrics },
        update: { label: c.label, metrics: c.metrics },
      });
    }
    // As noites são só-acrescentar: manda-se o que a BD ainda não tem.
    const ultima = await p.telemetryNight.findFirst({ orderBy: { endedAt: 'desc' } });
    const corte = ultima ? new Date(ultima.endedAt).getTime() : 0;
    const novas = plain.noites.filter((n) => n.em > corte);
    if (novas.length) {
      await p.telemetryNight.createMany({
        data: novas.map((n) => ({
          endedAt: new Date(n.em),
          mode: n.modo,
          intensity: n.intensidade,
          players: n.jogadores,
          rounds: n.rondas,
          minutes: n.minutos,
          outcome: n.outcome,
          modifiers: n.modifiers,
          eliminated: n.eliminados,
          drinks: n.goles,
        })),
        skipDuplicates: true,
      });
    }
    return true;
  } catch (e) {
    log.warn('telemetria: falhou a gravação na BD, fica o ficheiro', { message: e.message });
    return false;
  }
}

export async function loadDb(prisma) {
  const p = prisma || (await prismaClient());
  if (!temTabelas(p)) return false;
  try {
    const [counters, noites] = await Promise.all([
      p.telemetryCounter.findMany(),
      p.telemetryNight.findMany({ orderBy: { endedAt: 'desc' }, take: MAX_NOITES }),
    ]);
    if (!counters.length && !noites.length) return false;
    fromPlain({
      desde: noites.length ? new Date(noites[noites.length - 1].endedAt).getTime() : Date.now(),
      counters: counters.map((c) => ({ scope: c.scope, key: c.key, label: c.label, metrics: c.metrics })),
      noites: noites
        .slice()
        .reverse()
        .map((n) => ({
          em: new Date(n.endedAt).getTime(),
          modo: n.mode,
          intensidade: n.intensity,
          jogadores: n.players,
          rondas: n.rounds,
          minutos: n.minutes,
          outcome: n.outcome,
          modifiers: n.modifiers || [],
          eliminados: n.eliminated,
          goles: n.drinks,
        })),
    });
    return true;
  } catch (e) {
    log.warn('telemetria: falhou a leitura da BD, tento o ficheiro', { message: e.message });
    return false;
  }
}

/**
 * Arranque: a BD manda (é a que sobrevive a trocar de máquina), o ficheiro é o
 * plano B. Nunca lança — pior do que perder contagens era não abrir o servidor.
 */
export async function restore() {
  if (!ENABLED) return;
  const daBd = await loadDb().catch(() => false);
  if (!daBd) loadFile();
  log.info('telemetria: contagens carregadas', {
    origem: daBd ? 'bd' : 'ficheiro',
    noites: estado.noites.length,
  });
}

let timers = [];

/** Gravação periódica. Só o processo do servidor chama isto (nunca os testes). */
export function startAutosave() {
  if (!ENABLED || timers.length) return;
  const t1 = setInterval(() => {
    if (!estado.sujo) return;
    estado.sujo = false;
    saveFile();
  }, FILE_EVERY_MS);
  const t2 = setInterval(() => {
    saveDb().catch(() => {});
  }, DB_EVERY_MS);
  timers = [t1, t2];
  for (const t of timers) t.unref?.();
}

export function stopAutosave() {
  for (const t of timers) clearInterval(t);
  timers = [];
}

/** Grava já (usado no encerramento e pelos testes). */
export async function flush({ db = false } = {}) {
  const ok = saveFile();
  if (db) await saveDb();
  return ok;
}

/** Só para os testes: estado limpo sem tocar em disco nenhum. */
export function _reset() {
  estado.counters = new Map();
  estado.noites = [];
  estado.desde = Date.now();
  estado.sujo = false;
}
