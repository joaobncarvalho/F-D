# F&D — Friends and Drinking

Jogo multiplayer em tempo real para jogar presencialmente entre amigos, cada um
no seu telemóvel ligado à mesma sala. Ver documento de design (`FD.pdf`).

## Stack

- **Frontend:** React + Vite + TailwindCSS + Framer Motion
- **Backend/realtime:** Node.js + Express + Socket.io
- **BD (fase seguinte):** PostgreSQL + Prisma
- **Salas ativas:** estado em memória (`Map` por sala) para latência mínima

## Estrutura

```
fd/
├── server/   # Express + Socket.io, RoomManager em memória
└── client/   # Vite + React + Tailwind (mobile-first)
```

## Como correr (dev)

Precisas de dois terminais.

**1. Backend**

```bash
cd server
npm install
npm run dev        # http://localhost:3001
```

**2. Frontend**

```bash
cd client
npm install
npm run dev        # http://localhost:5173
```

Abre `http://localhost:5173`. Para testar com telemóveis reais na mesma rede,
usa o IP da tua máquina (o Vite mostra o endereço "Network") e define
`VITE_SERVER_URL` no `client/.env` a apontar para esse IP:3001.

## Estado atual — Semana 1 (roadmap FD)

- [x] Skeleton frontend + backend
- [x] Sala em memória: criar / juntar por código
- [x] Nome único dentro da sala
- [x] Ligação WebSocket + lobby em tempo real
- [x] Chat de grupo (base)
- [ ] Animação de transição de início (Semana 2)
- [ ] Botão "Start" funcional → arranque do jogo (Semana 3)

## Próximos pontos

Ver `FD.pdf` secção 6 (Roadmap). Semana 2: lobby polido + animações-chave.
Semana 3: roda de seleção, rondas, sistema de vidas. Integração Prisma quando o
schema estiver estável.
