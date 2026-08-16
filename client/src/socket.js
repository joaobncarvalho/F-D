import { io } from 'socket.io-client';

// URL do backend realtime. Em dev aponta para localhost:3001;
// em produção define VITE_SERVER_URL no ambiente de build.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// Uma única ligação partilhada por toda a app.
// autoConnect: false — só ligamos quando o utilizador cria/junta uma sala.
export const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket'],
});
