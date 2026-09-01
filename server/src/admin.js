// F&D — página e API de administração de conteúdo (Boca Calada, Intrigas, Desafio…).
// Protegida por ADMIN_PASSWORD (header x-admin-password). Serve uma página estática
// simples em /admin; a API vive em /admin/api/*. Só funciona com BD configurada.

import express from 'express';
import { fileURLToPath } from 'node:url';
import * as repo from './repo.js';

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

  router.get('/api/game-types', wrap(async (_req, res) => {
    res.json(await repo.adminGameTypes());
  }));

  router.get('/api/prompts', wrap(async (req, res) => {
    res.json(await repo.adminListPrompts(req.query.type || undefined));
  }));

  const cleanDuration = (d) => {
    if (d === '' || d === null || d === undefined) return null;
    const n = parseInt(d, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(10, n) : null;
  };

  router.post('/api/prompts', wrap(async (req, res) => {
    const { gameTypeKey, text, intensity, buddy, duration } = req.body || {};
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
      })
    );
  }));

  router.patch('/api/prompts/:id', wrap(async (req, res) => {
    const { text, intensity, active, buddy, duration } = req.body || {};
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
    res.json(await repo.adminUpdatePrompt(req.params.id, data));
  }));

  router.delete('/api/prompts/:id', wrap(async (req, res) => {
    res.json(await repo.adminDeletePrompt(req.params.id));
  }));

  // ----- Bancos do Tabuleiro (?? / prisão / cartas) -----
  const CATEGORIES = ['evento', 'prisao', 'carta', 'regra'];
  const EVENT_EFFECTS = ['advance', 'back', 'drink', 'card', 'prison', 'others_drink', 'alliance', 'rule_roulette', 'mirror'];
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
