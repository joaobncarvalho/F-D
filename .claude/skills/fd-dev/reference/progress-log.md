# F&D — Progress Log (LIVING)

> Acrescenta a entrada **mais recente no topo**. Formato:
> `## AAAA-MM-DD — Título` seguido de: o que mudou · ficheiros · como foi verificado.

---

## 2026-08-16 — Boca Calada dedicado + perguntas dos jogadores + spin pela vez

Pedidos do João sobre o Boca Calada e o fluxo da roda.

**O que mudou**
- **Fase de perguntas** no início (`phase: 'questions'`): cada jogador escreve
  perguntas embaraçosas dirigidas a outros participantes (não a si). Guardadas em
  `room.game.questions` (memória; são da sessão, sobre as pessoas à mesa — não vão
  para a BD global). O host arranca com `begin_play`.
- **Boca Calada** deixou de ser um prompt genérico: mostra uma **pergunta dirigida**
  ao jogador da vez (das submetidas). Opções: "🤐 Boca Calada" (bebe = recusa) ou
  "🎤 Respondo" (passa a vez = aceita). Fallback ao banco seed se não houver pergunta.
- **Quem gira a roda passou a ser o jogador da vez** (não o host). A vez é definida
  pelo servidor (rotação sequencial); o próprio gira para revelar o tipo. Host mantém
  saltar/terminar.

**Ficheiros**
- `server/src/game.js` (reescrito: fase questions, addQuestion, beginPlay, spin pela
  vez, advanceTurn no resolve, pickQuestion dirigida)
- `server/src/{socket,rooms}.js` (eventos add_question/begin_play; serialização de
  currentPlayerId + contagens de perguntas)
- `client/src/pages/Game.jsx` (QuestionsPhase, spin pela vez, botões Boca Calada)
- `client/src/App.jsx` (emitters addQuestion/beginPlay)

**Como foi verificado**
- E2E Boca Calada: start→questions, add_question (contagem por alvo), auto-pergunta
  bloqueada, begin_play→wheel, spin fora-da-vez bloqueado, **Boca Calada mostrou a
  pergunta dirigida certa** ✅
- Rotação sequencial com 3 jogadores: Joao → Marta → Rui → Joao… ✅
- `client npm run build` sem erros ✅

**A seguir**
- Mecânicas dedicadas em falta: votação anónima (Intrigas), submissão anónima (Segredos).
- BD quando o João abrir o chat da Supabase.

---

## 2026-08-16 — Semana 3: motor de jogo (contra dados em memória)

Construída sem BD, com **seam de integração** pronto para trocar por Prisma depois.

**Decisões (defaults, na ausência de resposta):** vidas = 3 configurável 1–5;
vez sequencial; intensidade escolhida pelo host no lobby.

**O que ficou feito**
- **Seam de conteúdo:** `content/prompts.data.js` (dados, fonte única partilhada
  com o `seed.js`) + `repo.js` (funções async `getGameTypes`/`getRandomPrompt`
  com a MESMA assinatura do futuro Prisma → troca localizada).
- **Motor `game.js`:** initGame (aplica config), spinWheel (tipo+jogador+prompt,
  rotação sequencial, servidor autoritário), resolveAction (recusa → vida/shot),
  skipTurn, endGame (stats), resetToLobby; serialização do estado no room_state.
- **Eventos socket:** `spin_wheel`, `player_action`, `skip_turn`, `end_game`,
  `reset_game` → `round_started`, `action_result`, `game_over`, `back_to_lobby`.
- **Cliente:** `Wheel.jsx` (roda SVG animada a parar no resultado do servidor),
  `Game.jsx` (fases roda→prompt→fim, aceito/recuso, flash de feedback, barra de
  vidas animada, ecrã final com pódio "bebeu mais"/"recusou mais", controlos do
  host); config no `Lobby.jsx` (vidas 1–5 + leve/picante); `App.jsx` com emitters
  e `back_to_lobby`.

**Ficheiros**
- `server/src/{game,repo}.js`, `server/src/content/prompts.data.js`
- `server/src/{socket,rooms}.js` (eventos + serializeRoom.game), `prisma/seed.js` (refactor p/ dados partilhados)
- `client/src/pages/{Game,Lobby}.jsx`, `client/src/components/Wheel.jsx`, `client/src/App.jsx`

**Como foi verificado**
- Smoke test do motor: rotação sequencial, vida→shot a 0, não-host/fora-da-vez
  bloqueados, stats ✅
- **Teste end-to-end Socket.io (7 passos):** start c/ config, spin (tipo+vez+
  prompt), refuse→vida_perdida, não-host bloqueado, +5 rondas, game_over c/ stats,
  reset→lobby ✅
- `repo`/dados: 4 tipos, 88 prompts, filtro por intensidade ✅
- `client npm run build` → 498 módulos, sem erros ✅
- Backend + frontend a correr em localhost (3001 / 5173).

**A seguir**
- Playtest no browser (roda + rondas + vidas + fim).
- Mecânicas dedicadas: votação (Intrigas), submissão anónima (Segredos), timer (Boca Calada).
- BD: criar Supabase + strings → `db:migrate` + `db:seed` → trocar interior de `repo.js` por Prisma.

---

## 2026-08-16 — Skill de dev + scaffold BD (Prisma) + Semana 2 (lobby/animações)

**O que ficou feito**
- Criada a skill `fd-dev` completa (SKILL.md + roadmap, backlog com 14 ideias
  novas, architecture, db-setup, progress-log).
- **BD (scaffold pronto a correr):** Prisma instalado; `schema.prisma` com todos
  os modelos do FD §4 (rooms, players, chat_messages, game_types, prompts,
  game_rounds, life_events + enums), validado e `prisma generate` OK; `seed.js`
  idempotente com ~22 prompts × 4 tipos (leve/picante). Scripts `db:*` no
  package.json. Falta só a instância Supabase + connection strings.
- **Semana 2 (app):** transição countdown 3-2-1 (`Countdown.jsx`); botão Start
  funcional (`start_game` → `game_started` → countdown → `Game.jsx` placeholder);
  reconexão automática (`rejoin_room` + `session_invalid`, sessão em
  sessionStorage, banner "a religar…"); QR code do código (`QRCode.jsx`) +
  copiar código + entrada por `?join=CÓDIGO`; badge offline por jogador.

**Ficheiros**
- `.claude/skills/fd-dev/**`
- `server/prisma/{schema.prisma,seed.js}`, `server/package.json`, `.env.example`
- `server/src/{rooms,socket}.js` (startGame, reconnect, novos handlers)
- `client/src/App.jsx` (máquina de estados + reconexão), `pages/{Home,Lobby,Game}.jsx`,
  `components/{Countdown,QRCode}.jsx`, `client/package.json` (qrcode)

**Como foi verificado**
- `prisma validate` + `prisma generate` OK (client gerado). Schema estruturalmente
  válido; só falta `.env` real para migrate/seed.
- `RoomManager` smoke test novo: start bloqueado c/ 1 jogador; start OK c/ 2;
  re-start bloqueado; reconnect OK; reconnect a sala inexistente rejeitado ✅
- **Teste end-to-end Socket.io (8 passos)**: criar, juntar, nome duplicado
  bloqueado, chat sincroniza, `game_started`, disconnect, **reconexão preserva
  estado (status=playing)**, reconexão inválida rejeitada ✅
- `client npm run build` → 497 módulos, sem erros ✅

**A seguir**
- BD: criar Supabase + meter strings em `server/.env` → `npm run db:migrate` + `db:seed`.
- Decidir perguntas pendentes #1 (vidas) e #2 (ordem de vez).
- Semana 3: motor de jogo (roda, rondas, vidas) + integração Prisma (prompts da BD).

---

## 2026-08-16 — Semana 1: fundações + sala em memória

**O que ficou feito**
- Monorepo `fd/` criado com `server/` (Express + Socket.io) e `client/`
  (Vite + React + Tailwind v4 + Framer Motion). Git inicializado.
- `RoomManager` em memória: criar sala (código 4 chars, alfabeto sem chars
  ambíguos), juntar por código, **nome único dentro da sala**, reatribuição de
  host ao desligar, remoção da sala quando fica vazia.
- Camada Socket.io: `create_room`, `join_room`, `send_message`, `disconnect`;
  broadcast de `room_state`, `room_joined`, `chat_message`, `error_msg`.
- Frontend: `Home` (criar/juntar) + `Lobby` (lista de jogadores realtime, chat,
  botão Start só-host/≥2 jogadores, aviso de moderação). Ecrãs animados com
  Framer Motion.
- Criada a skill `fd-dev` (roadmap, backlog, arquitetura, db-setup, este log).

**Ficheiros**
- `server/src/{index,socket,rooms}.js`, `server/package.json`, `.env.example`
- `client/src/{main,App,socket}.jsx|js`, `client/src/pages/{Home,Lobby}.jsx`,
  `client/src/index.css`, `client/{vite.config.js,index.html,package.json}`
- `README.md`, `.gitignore`
- `.claude/skills/fd-dev/**`

**Como foi verificado**
- `RoomManager` smoke test: código 4 chars, host, 3 vidas; nome duplicado
  bloqueado; código inválido bloqueado; host reatribuído ao desligar ✅
- Backend arranca; `GET /health` → `{ok:true}`; handshake Socket.io responde ✅
- `client` `npm run build` → 419 módulos, sem erros ✅
- ⚠️ **Ainda não testado live no browser** (2 separadores) — fazer no próximo
  arranque de `npm run dev`.

**Decisões tomadas**
- Monorepo (vs dois repos). Alfabeto de código sem 0/O/1/I.
- Forma dos dados em memória espelha o schema Prisma para integração localizada.

**A seguir**
- Testar realtime em 2 separadores.
- Semana 2: polir lobby + animação de countdown 3-2-1 + QR code do código.
- Decidir perguntas pendentes #1 (vidas) e #2 (ordem de vez) antes da Semana 3.
- BD: assim que houver connection strings da Supabase, scaffold Prisma + seed.
