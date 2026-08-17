import { io } from 'socket.io-client';

// URL do backend realtime:
//   - VITE_SERVER_URL (build) tem prioridade — para deploy do frontend à parte;
//   - em dev, aponta para localhost:3001 (o server corre noutra porta);
//   - em produção sem VITE_SERVER_URL, fica `undefined` → o Socket.io liga à
//     PRÓPRIA origem (deploy de imagem única: o backend serve o frontend).
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? 'http://localhost:3001' : undefined);

// Uma única ligação partilhada por toda a app.
// autoConnect: false — só ligamos quando o utilizador cria/junta uma sala.
// polling como fallback do websocket (útil atrás de proxies/CDN em produção).
export const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});
