# F&D — Friends and Drinking

Party game multiplayer em tempo real para jogar **presencialmente** entre amigos,
cada um no seu telemóvel ligado à mesma sala (estilo Kahoot/Jackbox). Desafios
sociais, mini-jogos e bebida. Ver documento de design (`FD.pdf`).

> ⚠️ Joga com moderação. O jogo é para maiores de idade e assume consumo responsável.

## Stack

- **Frontend:** React + Vite + TailwindCSS v4 + Framer Motion (mobile-first)
- **Backend/realtime:** Node.js + Express + Socket.io
- **BD:** PostgreSQL (Supabase) + Prisma — guarda o **conteúdo** (prompts, bancos do
  tabuleiro) e histórico. O estado "quente" das salas vive **em memória** (`Map` por
  sala) para latência mínima. Sem BD (dev), a app corre na mesma com conteúdo em código.

## Estrutura

```
fd/
├── server/   # Express + Socket.io, RoomManager em memória, motor dos jogos
│   ├── src/game.js     # modo Roda (rondas + vidas)
│   ├── src/board.js    # modo Tabuleiro (corrida + golos)
│   ├── src/repo.js     # camada de dados (Prisma OU fallback em código)
│   ├── src/admin.{js,html}  # dashboard de conteúdo + showroom
│   ├── src/content/    # prompts.data.js + board.data.js (fonte única, fallback)
│   ├── prisma/         # schema.prisma + seed.js
│   └── db/             # scripts SQL standalone (01_schema, 02_seed, 03_board_items)
└── client/   # Vite + React + Tailwind
    └── src/pages/{Home,Lobby,Game,Board,Demo}.jsx
```

## Dois modos de jogo

- **🎡 Roda** — roleta escolhe o tipo; rondas com sistema de **vidas** (recusa → bebe;
  0 vidas → eliminado/espectador). Tipos: Boca Calada, Desafio, Isto ou Aquilo,
  Intrigas, Segredos, Pirâmide, Jogo do Vasco.
- **🎲 Tabuleiro** — corrida num tabuleiro de **60 casas**; avança-se bebendo golos,
  ganha quem dá a volta. Casas: mini-jogos rápidos, **??** (sorte), **Gamble**,
  **Blackjack**, **Beer Pinga**, cartas jogáveis (privadas). Sem vidas.

O modo escolhe-se no lobby (só o host).

## Como correr (dev)

Precisas de dois terminais.

**1. Backend**

```bash
cd server
npm install
npm run dev        # http://localhost:3001  (GET /health → {ok:true})
```

**2. Frontend**

```bash
cd client
npm install
npm run dev        # http://localhost:5173
```

Abre `http://localhost:5173`. Para telemóveis reais na mesma rede, usa o IP da
máquina (o Vite mostra o endereço "Network") e define `VITE_SERVER_URL` no
`client/.env` a apontar para `http://<IP>:3001`.

Sem `server/.env` (sem `DATABASE_URL`) o jogo corre à mesma — o conteúdo vem dos
módulos em `server/src/content/`.

## Base de dados (Supabase + Prisma)

Com as connection strings em `server/.env` (`DATABASE_URL` = pooler 6543;
`DIRECT_URL` = pooler/direta 5432):

```bash
cd server
npm run db:generate          # gera o Prisma client
npx prisma db push           # cria/atualiza as tabelas
npm run db:seed              # semeia prompts + bancos do tabuleiro
```

Alternativa sem Prisma: correr os scripts em `server/db/` no SQL editor da Supabase
(`01_schema.sql` → `02_seed.sql` → `03_board_items.sql`).

## Admin de conteúdo (`/admin`)

Dashboard protegido por `ADMIN_PASSWORD` (em `server/.env`), com três separadores:

- **📋 Conteúdo** — CRUD dos prompts da roda (por tipo + intensidade leve/picante/
  hardcore/caos; flags buddy/duração).
- **🎲 Tabuleiro** — CRUD dos **bancos do tabuleiro**: casa **??** (efeitos tipados),
  **prisão** (consequências), e **cartas** (catálogo). Editar aqui não exige mexer em
  código; sem estes dados na BD, o jogo usa o fallback de `board.data.js`.
- **🎮 Demos** — showroom que renderiza os mini-jogos reais com dados fictícios (também
  acessível via `?demo=1`), para confirmar o aspeto sem começar um jogo.

## Deploy

Imagem única no **Railway** (`Dockerfile` multi-stage): o Express serve o
`client/dist` e o Socket.io. A imagem corre `prisma generate` no build. No ar em
`https://f-d.up.railway.app`.

Variáveis necessárias no Railway: `DATABASE_URL`, `DIRECT_URL`, `ADMIN_PASSWORD`
(e opcionalmente `CLIENT_ORIGIN`). O deploy inclui **ambos os modos** (roda +
tabuleiro).
