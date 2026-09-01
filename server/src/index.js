import 'dotenv/config'; // carrega server/.env em dev; em produção (Railway) não faz nada
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { registerSocketHandlers, restoreRooms } from './socket.js';
import { createAdminRouter } from './admin.js';
import { log } from './log.js';

const PORT = process.env.PORT || 3001;

// Rede de segurança: um erro solto num timer/promessa NÃO deve deitar o servidor
// abaixo e fechar TODAS as salas. Registamos e seguimos (numa festa, manter o
// jogo vivo vale mais do que reiniciar). Se um dia quiseres política de reinício,
// é aqui.
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', { reason: reason instanceof Error ? reason.message : String(reason) });
});
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { message: err?.message, stack: err?.stack });
});

// Origem(ns) permitida(s) no CORS/Socket.io:
//   - CLIENT_ORIGIN por definir → '*' (útil no deploy de imagem única, mesma origem);
//   - uma ou várias origens separadas por vírgula (ex.: "http://localhost:5173,https://app…").
const rawOrigin = process.env.CLIENT_ORIGIN || '*';
const corsOrigin = rawOrigin === '*' ? '*' : rawOrigin.split(',').map((s) => s.trim());

const app = express();
app.use(cors({ origin: corsOrigin }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'fd-server' }));

// Página de admin (dev/conteúdo) — protegida por ADMIN_PASSWORD. Antes do catch-all da SPA.
app.use('/admin', createAdminRouter());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
});

registerSocketHandlers(io);

// Serve o frontend compilado (deploy de imagem única). Em dev o dist pode não
// existir — nesse caso só corre a API. O Socket.io intercepta /socket.io/ antes
// do Express, por isso o catch-all da SPA não lhe mexe.
const clientDist = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : fileURLToPath(new URL('../../client/dist', import.meta.url));

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  log.info('A servir frontend', { dir: clientDist });
}

// Só se abre a porta depois de as salas do reinício anterior estarem de volta.
await restoreRooms().catch((err) => log.warn('snapshot: recuperação falhou', { message: err?.message }));

// Falhar a abrir a porta não é um erro recuperável: sem isto, o safety net do
// uncaughtException engolia o EADDRINUSE e ficava um processo vivo a não servir
// ninguém (e o deploy dava-se por bom).
httpServer.on('error', (err) => {
  log.error('não foi possível abrir a porta', { port: PORT, message: err?.message });
  process.exit(1);
});

httpServer.listen(PORT, () => {
  log.info('F&D server a ouvir', { url: `http://localhost:${PORT}`, cors: rawOrigin });
});
