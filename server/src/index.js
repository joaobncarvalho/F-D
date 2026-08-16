import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './socket.js';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'fd-server' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`F&D server a ouvir em http://localhost:${PORT}`);
  console.log(`CORS permitido para ${CLIENT_ORIGIN}`);
});
