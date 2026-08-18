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

  router.post('/api/prompts', wrap(async (req, res) => {
    const { gameTypeKey, text, intensity } = req.body || {};
    const clean = String(text || '').trim();
    if (!gameTypeKey) return res.status(400).json({ error: 'Escolhe o tipo de jogo.' });
    if (clean.length < 3) return res.status(400).json({ error: 'Texto demasiado curto.' });
    if (!['leve', 'picante', 'hardcore', 'caos'].includes(intensity))
      return res.status(400).json({ error: 'Intensidade inválida.' });
    res.json(await repo.adminCreatePrompt({ gameTypeKey, text: clean.slice(0, 300), intensity }));
  }));

  router.patch('/api/prompts/:id', wrap(async (req, res) => {
    const { text, intensity, active } = req.body || {};
    const data = {};
    if (text !== undefined) data.text = String(text).trim().slice(0, 300);
    if (intensity !== undefined) {
      if (!['leve', 'picante', 'hardcore', 'caos'].includes(intensity))
        return res.status(400).json({ error: 'Intensidade inválida.' });
      data.intensity = intensity;
    }
    if (active !== undefined) data.active = !!active;
    res.json(await repo.adminUpdatePrompt(req.params.id, data));
  }));

  router.delete('/api/prompts/:id', wrap(async (req, res) => {
    res.json(await repo.adminDeletePrompt(req.params.id));
  }));

  return router;
}
