import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './socket.js';

const PORT = process.env.PORT || 3001;

// Origem(ns) permitida(s) no CORS/Socket.io:
//   - CLIENT_ORIGIN por definir → '*' (útil no deploy de imagem única, mesma origem);
//   - uma ou várias origens separadas por vírgula (ex.: "http://localhost:5173,https://app…").
const rawOrigin = process.env.CLIENT_ORIGIN || '*';
const corsOrigin = rawOrigin === '*' ? '*' : rawOrigin.split(',').map((s) => s.trim());

const app = express();
app.use(cors({ origin: corsOrigin }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'fd-server' }));

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
  console.log(`A servir frontend de ${clientDist}`);
}

httpServer.listen(PORT, () => {
  console.log(`F&D server a ouvir em http://localhost:${PORT}`);
  console.log(`CORS: ${rawOrigin}`);
});
