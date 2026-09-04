// F&D — página e API de administração de conteúdo (Boca Calada, Intrigas, Desafio…).
// Protegida por ADMIN_PASSWORD (header x-admin-password). Serve uma página estática
// simples em /admin; a API vive em /admin/api/*. Só funciona com BD configurada.

import express from 'express';
import { fileURLToPath } from 'node:url';
import * as repo from './repo.js';
import * as telemetria from './telemetria.js';

export function createAdminRouter() {
  const router = express.Router();
  router.use(express.json());

  // Página estática (auto-contida) — pede a password e fala com a API.
  const page = fileURLToPath(new URL('./admin.html', import.meta.url));
  router.get('/', (_req, res) => res.sendFile(page));

  // Auth simples por header para todas as rotas /api.
  router.use('/api', (req, res, next) => {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) return res.status(503).json({ error: 'ADMIN_PASSWORD não definido no servidor.' });
    if (req.get('x-admin-password') !== expected) return res.status(401).json({ error: 'Password inválida.' });
    next();
  });

  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };

  router.get('/api/check', (_req, res) => res.json({ ok: true }));

  // ----- Estatísticas (server/src/telemetria.js) -----
  //
  // A admin deixava escrever conteúdo sem nunca dizer se ele prestava. Isto é o
  // retorno: o que saiu, o que foi aceite, o que toda a gente recusou. Vem já
  // calculado do módulo — as regras de leitura (o que é amostra suficiente) são
  // decisões de produto e ficam onde há testes, não no JavaScript da página.
  router.get('/api/stats', wrap(async (req, res) => {
    const min = Math.max(1, parseInt(req.query.min, 10) || 4);
    res.json(telemetria.resumo({ minAmostra: min }));
  }));

  /**
   * O cruzamento que dá as decisões de conteúdo: cada prompt com o que lhe
   * aconteceu à mesa. Feito no servidor porque só ele sabe a chave de hash com
   * que a telemetria arruma os prompts — e porque assim inclui os que NUNCA
   * saíram, que são metade da informação e não estão em contador nenhum.
   */
  router.get('/api/stats/conteudo', wrap(async (_req, res) => {
    const prompts = await repo.allPromptsForStats();
    res.json(
      prompts.map((p) => ({
        id: p.id,
        text: p.text,
        intensity: p.intensity,
        typeKey: p.typeKey,
        typeLabel: p.typeLabel,
        ...telemetria.porPrompt(p.typeKey, p.text),
      }))
    );
  }));

  // Contagem limpa antes de um playtest: sem isto, os números de uma noite a
  // sério ficavam misturados com os das dezenas de salas de teste.
  router.post('/api/stats/reset', wrap(async (_req, res) => {
    await telemetria.limpa();
    res.json({ ok: true });
  }));

  // Força a gravação (ficheiro + BD). A gravação normal é periódica; isto existe
  // para poder confirmar à mão que a BD está mesmo a receber.
  router.post('/api/stats/flush', wrap(async (_req, res) => {
    res.json({ ok: await telemetria.flush({ db: true }) });
  }));

  router.get('/api/game-types', wrap(async (_req, res) => {
    res.json(await repo.adminGameTypes());
  }));

  router.get('/api/prompts', wrap(async (req, res) => {
    res.json(await repo.adminListPrompts(req.query.type || undefined));
  }));

  // Packs temáticos: um prompt SEM tag serve qualquer ocasião (aditivos).
  const PACKS = ['aniversario', 'despedida', 'reencontro'];
  const cleanTag = (t) => (PACKS.includes(t) ? t : null);

  const cleanDuration = (d) => {
    if (d === '' || d === null || d === undefined) return null;
    const n = parseInt(d, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(10, n) : null;
  };

  router.post('/api/prompts', wrap(async (req, res) => {
    const { gameTypeKey, text, intensity, buddy, duration, tag } = req.body || {};
    const clean = String(text || '').trim();
    if (!gameTypeKey) return res.status(400).json({ error: 'Escolhe o tipo de jogo.' });
    if (clean.length < 3) return res.status(400).json({ error: 'Texto demasiado curto.' });
    if (!['leve', 'picante', 'hardcore', 'caos'].includes(intensity))
      return res.status(400).json({ error: 'Intensidade inválida.' });
    res.json(
      await repo.adminCreatePrompt({
        gameTypeKey,
        text: clean.slice(0, 300),
        intensity,
        buddy: !!buddy,
        duration: cleanDuration(duration),
        tag: cleanTag(tag),
      })
    );
  }));

  router.patch('/api/prompts/:id', wrap(async (req, res) => {
    const { text, intensity, active, buddy, duration, tag } = req.body || {};
    const data = {};
    if (text !== undefined) data.text = String(text).trim().slice(0, 300);
    if (intensity !== undefined) {
      if (!['leve', 'picante', 'hardcore', 'caos'].includes(intensity))
        return res.status(400).json({ error: 'Intensidade inválida.' });
      data.intensity = intensity;
    }
    if (active !== undefined) data.active = !!active;
    if (buddy !== undefined) data.buddy = !!buddy;
    if (duration !== undefined) data.duration = cleanDuration(duration);
    if (tag !== undefined) data.tag = cleanTag(tag);
    res.json(await repo.adminUpdatePrompt(req.params.id, data));
  }));

  router.delete('/api/prompts/:id', wrap(async (req, res) => {
    res.json(await repo.adminDeletePrompt(req.params.id));
  }));

  // ----- Bancos do Tabuleiro (?? / prisão / cartas) -----
  const CATEGORIES = ['evento', 'prisao', 'carta', 'regra'];
  const EVENT_EFFECTS = [
    'advance', 'back', 'drink', 'all_drink', 'others_drink', 'leader_drink', 'drink_per_card',
    'last_advance', 'card', 'steal_card', 'trade_cards', 'shield', 'swap_leader', 'skip',
    'prison', 'alliance', 'rule_roulette', 'mirror',
  ];
  const CARD_KEYS = ['swap', 'back2', 'prison', 'skip', 'shield', 'drink3', 'steal', 'curse_drink', 'curse_back', 'curse_prison'];
  const intOr = (v, def = 0) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  };

  // Normaliza + valida o corpo consoante a categoria. Devolve os dados p/ Prisma.
  function cleanBoardItem(body, { partial = false } = {}) {
    const out = {};
    const cat = body.category;
    if (!partial || body.category !== undefined) {
      if (!CATEGORIES.includes(cat)) throw new Error('Categoria inválida.');
      out.category = cat;
    }
    if (body.emoji !== undefined) out.emoji = String(body.emoji || '🎲').slice(0, 8);
    if (body.title !== undefined) out.title = String(body.title || '').trim().slice(0, 120);
    if (body.desc !== undefined) out.desc = String(body.desc || '').trim().slice(0, 200);
    if (body.weight !== undefined) out.weight = Math.max(1, Math.min(20, intOr(body.weight, 1)));
    if (body.active !== undefined) out.active = !!body.active;
    // Campos por categoria (aceita quando presentes).
    if (body.effect !== undefined) out.effect = body.effect || null;
    if (body.value !== undefined) out.value = body.value === '' || body.value == null ? null : intOr(body.value, 0);
    if (body.skipTurns !== undefined) out.skipTurns = Math.max(0, intOr(body.skipTurns, 0));
    if (body.drink !== undefined) out.drink = Math.max(0, intOr(body.drink, 0));
    if (body.back !== undefined) out.back = Math.max(0, intOr(body.back, 0));
    if (body.loseCard !== undefined) out.loseCard = !!body.loseCard;
    return out;
  }

  function validateNew(data) {
    if (!data.title || data.title.length < 1) throw new Error('Falta o título/nota.');
    if (data.category === 'evento') {
      if (!EVENT_EFFECTS.includes(data.effect)) throw new Error('Efeito de ?? inválido.');
    } else if (data.category === 'carta') {
      if (!CARD_KEYS.includes(data.effect)) throw new Error('Carta (key) inválida.');
    }
  }

  router.get('/api/board-items', wrap(async (req, res) => {
    res.json(await repo.adminListBoardItems(req.query.category || undefined));
  }));

  router.post('/api/board-items', wrap(async (req, res) => {
    const data = cleanBoardItem(req.body || {});
    validateNew(data);
    res.json(await repo.adminCreateBoardItem(data));
  }));

  router.patch('/api/board-items/:id', wrap(async (req, res) => {
    const data = cleanBoardItem(req.body || {}, { partial: true });
    res.json(await repo.adminUpdateBoardItem(req.params.id, data));
  }));

  router.delete('/api/board-items/:id', wrap(async (req, res) => {
    res.json(await repo.adminDeleteBoardItem(req.params.id));
  }));

  return router;
}
