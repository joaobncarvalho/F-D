# F&D — Progress Log (LIVING)

> Acrescenta a entrada **mais recente no topo**. Formato:
> `## AAAA-MM-DD — Título` seguido de: o que mudou · ficheiros · como foi verificado.

---

## 2026-08-17 — Vasco v2 (só o tema, host marca) + fixes de animação/mobile

**Fix animação (reportado):** o efeito de reveal (confetti+som) disparava para
qualquer `substate === 'reveal'`; o Vasco usa 'reveal' para MOSTRAR O PAPEL →
confetti por cima do ecrã ao calhar o Vasco. Excluído o vasco desse efeito
(celebração do Vasco é no `result`). `client/src/pages/Game.jsx`.

**Mobile (reportado "tudo pequeno"):** roda passou de 260px fixos para
`min(86vw, 400px)` (responsiva, centrada H+V na fase da roda), ponteiro/labels
maiores; botão Girar e textos aumentados; base tipográfica 17.5px em ≤480px.

**Vasco v2 (pedido do João):** o Vasco deixa de ver as 9 palavras — a sua única
pista passa a ser o **tema** (ex.: 'Animais'). Palpita **em voz alta** e o **host
marca** acertou/falhou (`vasco_judge`), em vez de escolher no quadro. A identidade
dos Vascos fica escondida em reveal/clues e é **revelada na fase de palpite** para
o host poder marcar. Palavra secreta e 9 palavras nunca no broadcast (tema é
público). Acerta → +1 vida; falha → 5 golos. Ficheiros: `game.js` (dealVasco +
impostorInfo, vascoJudge substitui vascoGuess, serialização por tema), `socket.js`
(`vasco_judge`), `App.jsx`/`Game.jsx` (VascoCard reescrito, WordBoard removido).
Smoke test (acerta/falha, anonimato por fase, não-host bloqueado) ✓.

**A seguir (decidido, ainda por fazer):**
- **Intensidade** Leve · Picante(+18/festa) · **Hardcore** (novo, pior): falta
  enum/UI/filtragem + conteúdo.
- **Página de admin** para escrever desafios (Boca Calada/Intrigas/Desafios) →
  **precisa das connection strings da Supabase** (BD do colega). Bloqueado até lá.

---

## 2026-08-17 — Deploy (Railway) + fix: sala fechava ao partilhar o código

**Deploy:** imagem única no Railway — o Express passa a servir `client/dist`
(fallback SPA; Socket.io intercepta `/socket.io/` antes, por isso o catch-all não
lhe mexe). CORS aceita `*` se `CLIENT_ORIGIN` não estiver definido, ou lista por
vírgulas. Cliente liga à própria origem em produção (sem `VITE_SERVER_URL`) e
mantém `localhost:3001` em dev; fallback de `polling`. `Dockerfile` multi-stage +
`.dockerignore`. **No ar:** https://f-d.up.railway.app (health/SPA/handshake ✓).

**Fix (reportado pelo João):** criar sala → sair da app para partilhar o código →
ao voltar, a sala tinha fechado. Causa: o host ficava sozinho; ao suspender o
separador o WebSocket caía e `handleDisconnect` apagava a sala **imediatamente**
(ninguém ligado). Agora as salas vazias têm um **período de graça**
(`EMPTY_ROOM_GRACE_MS`, 120 s) antes de serem removidas; `reconnect`/`joinRoom`
cancelam a remoção pendente. Ficheiro: `server/src/rooms.js` (scheduleCleanup/
cancelCleanup). Smoke test: sobrevive+recupera na graça · apagada se ninguém
voltar · sobrevive se alguém entrar ✓.
> Nota: cobre o caso "background → voltar" (a sessão fica em `sessionStorage`,
> que sobrevive ao background). Se o browser **matar** o separador, a sessão
> perde-se — endurecer com `localStorage` fica como melhoria futura.

---

## 2026-08-17 — Jogo do Vasco (Impostor): 6.º jogo + roda a ~10% para a Piramide

Segundo jogo novo pedido pelo João + afinação da roda + fix de crash.

**Roda:** seleção reescrita — a Piramide passa a ter uma **fração-alvo fixa**
(`PIRAMIDE_SHARE = 0.10` ≈ 10%) e os restantes tipos dividem os 90% **por igual**
(robusto a adicionar/remover tipos). Verificado: piramide ~9.6%, outros ~18%.

**Fix (browser):** `intrigasReason` rebentava (`Cannot read 'reason' of null`) ao
entrar no jogo sem ronda; guarda por `round` existir. Novo `ErrorBoundary`
(`client/src/components/ErrorBoundary.jsx`) mostra erros de render num painel com
**Copiar erro** (mensagem+stack+ecrã) — a envolver os ecrãs no `App.jsx`.

**Jogo do Vasco (Impostor):** mini-jogo de dedução, dirigido por mecânica.
- Quadro de **9 palavras** (tema) público; o grupo recebe **qual** é a secreta, o(s)
  **Vasco(s)** não. 1 Vasco (ou 2 se ≥6 jogadores), escolhidos ao acaso.
- Fases (`round.substate`): `reveal` (papel privado) → `clues` (pistas **à vez**,
  verbais; o jogador da vez marca "dei a pista") → `guessing` (cada Vasco escolhe
  uma palavra do quadro) → `result`. Acerta → **+1 vida**; falha → **5 golos**.
- Palavra secreta e identidade dos Vascos **nunca** no broadcast (entrega privada
  `vasco_role`, reenviada no `rejoin`). Reveal forçável (host/quem girou) via
  `reveal_result` se um Vasco ficar AFK.

**Ficheiros**
- `server/src/content/prompts.data.js` (tipo `vasco` + `VASCO_BOARDS`: 12 quadros)
- `server/src/repo.js` (`getRandomVascoBoard`)
- `server/src/game.js` (dealVasco, máquina de estados, papéis, resultado/prémio,
  serialização anonimizada; `pickWeightedType` reescrito; extensões de
  `revealResult`/`continueRound`)
- `server/src/socket.js` (`vasco_start_clues/clue_done/guess`, `vasco_role` privado
  no spin e no rejoin, flash do prémio)
- `client/src/App.jsx` (estado+listener `vasco_role`, 3 emitters, props),
  `client/src/pages/Game.jsx` (6.º segmento, `VascoCard` + `WordBoard`, highlight
  do turno de pistas)

**Verificação**
- Smoke do motor (2 cenários): Vasco **acerta → +1 vida**; **falha → 5 golos**;
  anonimato do round (sem `secretWord`/`impostorIds`); volta à roda ✓
- **E2E Socket.io real** (3 clientes): papéis privados sem fuga, pistas à vez,
  todos os Vascos acertam → +1 vida cada + flash `vida_extra`, volta à roda ✓
- Distribuição da roda (12 000 spins): piramide 9.6%, outros ~18% ✓
- `client npm run build` → 502 módulos, sem erros ✓

**Notas**
- BD: `game_types` ganha `vasco` (0 prompts) no seed; o **SQL estático**
  (`db/02_seed.sql`) precisa da linha quando o colega regerar. Os `VASCO_BOARDS`
  vivem no código (mecânica), como a Piramide.
- As pistas são **verbais** (presencial); a app só sequencia as vezes. Um passo
  seguinte possível: votação para "apanhar o Vasco" (não pedido — o prémio/castigo
  atual é só sobre o Vasco adivinhar).

---

## 2026-08-17 — Piramide (Desconfia): 5.º jogo na roda

Novo tipo de jogo pedido pelo João. Mini-jogo completo de bluff com cartas
digitais, arbitrado pelo servidor, que entra na roda como os outros tipos.

**Mecânica**
- Ao calhar na roda: o servidor dá **3 cartas privadas** a cada jogador (mão nunca
  vai no broadcast) para **memorizar**, e monta uma **pirâmide de 15 cartas**
  (base→topo 5/4/3/2/1; golos 2/4/6/8/10). Match por **número** (rank), não naipe.
- Fases (`round.substate`): `memorize` (todos "já memorizei" → começa) → `flipping`
  (o flipper da vez **vira** a carta e **atribui** a alguém ou **passa**) →
  `challenge` (o alvo **aceita** e bebe os golos, ou **desconfia**) → `resolved`
  (revela **só** o veredicto do número reclamado, não a mão toda) → repete →
  `summary`. Desconfiança: se o flipper tinha mesmo, o alvo bebe o **dobro**; se
  era bluff, o flipper bebe o **dobro**.
- **Prémio:** quem **fez beber mais** ganha **+1 vida** no jogo principal (aplicado
  ao fechar via `continue_round`; flash `vida_extra`). Golos contam +1 em `drinks`.

**Ficheiros**
- `server/src/content/prompts.data.js` (tipo `piramide`, 0 prompts — é mecânica)
- `server/src/game.js` (baralho/deal, máquina de estados, serialização anonimizada,
  prémio, extensão de `continueRound`; acessor `piramideHand`)
- `server/src/socket.js` (handlers `piramide_ready/flip/assign/pass/respond/next`,
  emit privado `piramide_hand` no spin e no `rejoin_room`, flash do prémio)
- `client/src/App.jsx` (estado+listener `piramide_hand`, 6 emitters, props)
- `client/src/pages/Game.jsx` (5.º segmento na roda, `PiramideCard` com as 5
  sub-fases, `PyramidBoard`/`PlayingCard`, highlight do flipper, flash `vida_extra`)

**Verificação**
- Smoke test do motor (3 jogadores): Piramide na roda, **mãos ausentes do
  broadcast**, 3 cartas/jogador, memorize→flipping, 15 cartas jogadas, resumo,
  prémio +1 vida, volta à roda ✓
- **E2E Socket.io real** (3 clientes): mãos privadas entregues sem fuga, gate de
  memorização (2/3 mantém, 3/3 avança), fora-da-vez bloqueado, 15 cartas
  (aceitar/desconfiar), +1 vida aplicado **e** broadcast, flash `vida_extra`,
  volta à roda ✓
- `client npm run build` → 500 módulos, sem erros ✓

**Notas / a seguir**
- BD: `GameType.key` é String livre no Prisma → o seed aceita `piramide` (0
  prompts). O **SQL standalone** (`db/02_seed.sql`) é estático — o colega deve
  acrescentar a linha `game_types` do `piramide` quando regerar.
- Reconexão a meio da Piramide reenvia a mão; se um jogador ficar AFK, o host usa
  **Saltar vez** para abortar o mini-jogo.
- Playtest no browser (roda 1/5 → pirâmide) fica para o próximo arranque de `dev`.

---

## 2026-08-17 — Scripts SQL standalone da BD

Gerados scripts SQL para inicializar a BD diretamente (Supabase SQL editor / psql),
sem depender do Prisma — úteis para o colega rever/correr.

- `server/db/01_schema.sql` — enums, tabelas, índices, FKs. Gerado do `schema.prisma`
  via `prisma migrate diff` (fiel à app) + tornado **idempotente** (IF NOT EXISTS,
  DO-blocks para enums/FKs).
- `server/db/02_seed.sql` — game_types (UUIDs fixos) + 88 prompts (gen_random_uuid),
  idempotente via `ON CONFLICT`. Gerado de `src/content/prompts.data.js`.
- `server/db/README.md` + secção nova no `db-setup.md`.

**Verificação:** ambos os ficheiros validados com a gramática oficial do PostgreSQL
(`pg-query-emscripten`): 41 + 7 statements, sem erros de sintaxe. (Sem docker/psql
na máquina, não corri contra um PG real — falta ainda a instância Supabase.)

---

## 2026-08-16 — Intrigas v2: pergunta secreta + pedra-papel-tesoura

Redesenho do Intrigas a pedido do João (substitui a votação anónima anterior).

**Mecânica**
- Sai Intrigas → pergunta secreta **só no ecrã de quem girou** (acusador).
- O acusador escolhe alguém (o acusado **não sabe a razão** nem porque foi escolhido).
- Acusador e acusado jogam **pedra-papel-tesoura** (empate repete).
- Acusado ganha → fica a saber a razão. Acusado perde → **bebe** e nunca saberá.
- Espectadores ficam a par da pergunta (é a piada); só o acusado fica às escuras.

**Entrega privada da razão** (nunca no broadcast): `intrigas_reason` vai ao
acusador no spin, aos espectadores quando ele escolhe, e ao acusado só se ganhar.
Serialização de Intrigas nunca inclui a `reason` (verificado no payload).

**Ficheiros**
- `server/src/game.js` (chooseTarget, submitRps, RPS_BEATS; removidos castVote/tally;
  serializeRound com substate/accused/rps)
- `server/src/socket.js` (choose_target, submit_rps, intrigas_reason privado)
- `client/src/App.jsx` (intrigasReason state + listener; emitters), `pages/Game.jsx`
  (IntrigasCard: choosing → rps → reveal)

**Verificação (e2e, 3 jogadores)**
- Só o acusador tem a razão no spin ✓ · espectadores recebem-na ao escolher ✓ ·
  **acusado nunca a vê** ✓ · perde RPS → bebe e continua sem saber ✓ · ganha RPS →
  recebe a razão ✓ · empate repete ✓ · razão nunca no payload ✓
- Build 500 módulos sem erros ✓

---

## 2026-08-16 — Intrigas + Segredos + grande redesign (tema festa)

Fecha os 4 tipos de jogo e dá um upgrade visual/sensorial completo.

**Mecânicas novas (servidor)**
- **Intrigas** (fase `voting`): todos votam anonimamente ("quem é mais capaz…");
  votos escondidos até ao reveal; auto-revela quando todos votam; mais votado bebe.
- **Segredos** (fase `guessing`): segredos submetidos na prep (anónimos); grupo
  adivinha o autor; quem erra bebe (se todos acertam, o autor bebe). Autor **nunca**
  no payload; aviso **privado** `you_are_author` via sala Socket.io por playerId.
- Fase `prep` agora tem perguntas **e** segredos. `AppError` movido para `errors.js`
  (quebra ciclo rooms↔game). Serialização anonimizada em `serializeRound`.
- Novos eventos: add_secret, cast_vote, cast_guess, reveal_result, continue_round.

**Redesign (cliente)**
- Sistema de design em `index.css`: fundo de "luzes de festa" animado, cartas glass,
  botões gradiente, fonte display (Fredoka/Baloo), roda com halo.
- `sfx.js`: efeitos sonoros **sintetizados** (Web Audio, sem ficheiros) + mute
  persistente. `confetti.js`: confetti em canvas + `haptic()` (vibração).
- Todos os ecrãs redesenhados (Home, Lobby, Countdown, Game). Game ganhou
  `PrepPhase` (perguntas+segredos), `VotingCard`, `GuessingCard`.

**Verificação**
- E2E full (3 jogadores): prep, **Intrigas** (mais votado bebe), **Segredos** (aviso
  privado ao autor ✓, autor escondido pré-reveal ✓, quem erra bebe), game_over ✓
- Smoke test do motor Intrigas/Segredos + anonimização do payload ✓
- `npm run build` → 500 módulos, sem erros ✓

**A seguir**
- Playtest no browser (agora com som/confetti/vibração).
- BD quando o João abrir o chat da Supabase; depois deploy.

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
