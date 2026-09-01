# F&D — Progress Log (LIVING)

> Acrescenta a entrada **mais recente no topo**. Formato:
> `## AAAA-MM-DD — Título` seguido de: o que mudou · ficheiros · como foi verificado.

---

## 2026-09-01 (d) — Correções e melhorias do 1.º playtest

Quatro pontos vindos do teste com o grupo.

### 🐛 Beer Pinga: o 2.º jogador seguido não conseguia atirar
Bug real, com duas causas — as duas corrigidas:
- **servidor:** cair na casa não limpava o `lastEvent`, por isso o cliente ainda
  via a revelação do TIRO ANTERIOR; o ecrã só deixa apontar quando não há
  revelação a mostrar, logo ficava trancado;
- **cliente:** o `locked` (posto ao disparar) nunca voltava a false quando
  chegava uma casa nova.
Novo `test/board-beerpong.test.js` fixa o caso ("dois seguidos na mesma casa").

### 🐌 Beer Pinga: medidor mais lento (e correto)
O medidor andava **por frame** (`+0.03`), o que dava ~0,55 s por passagem — e o
DOBRO da velocidade num telemóvel a 120 Hz. Passou a ser por **relógio**
(`performance.now`), com 2,4 s por passagem. O disparo usa o valor exato do
toque (`powerRef`), não o estado do React, que podia estar um frame atrás.

### 🪙 Cara ou Coroa passa a ser lançado na app
Era só texto ("atirem uma moeda e digam quem ganhou"). Agora:
- `components/Coin.jsx` — moeda 3D a rodar, com salto e aterragem na face certa
  (voltas inteiras + meia volta se calhar coroa). O RESULTADO vem do servidor;
  a animação é só apresentação, e o vencedor só aparece depois de assentar.
- `game/duelo.js`: substate `calling` → quem lançou o duelo pede a face, o
  servidor lança, quem falha perde. Sem discussão à mesa.
- Entrou também como **tipo de duelo do Torneio** e está no showroom (`?demo`).

### 🏆 Torneio: com 6 pessoas era fraco
O problema não era o bracket, era o tempo morto: com 6, três saem na 1.ª ronda e
ficam a olhar. Três mudanças:
- **Apostas em TODOS os duelos** — quem não está a duelar (incluindo eliminados)
  aposta no vencedor; quem erra bebe 2. Secretas até ao resultado, senão apostava
  toda a gente no mesmo. É isto que mantém a mesa inteira dentro do jogo.
- **Final à melhor de 3** (`bestOf` no encontro): a primeira vitória já não
  elimina; o "continuar" reabre o MESMO encontro com um duelo novo até alguém
  chegar a 2. O marcador aparece no cabeçalho.
- **5.º tipo de duelo** (cara ou coroa) → menos repetição no quadro.
Novo `test/tournament-apostas.test.js` (4 casos: apostas secretas/pagas, o
eliminado continua a apostar, série da final, moeda).

### 🎲 Casa ?? deixou de ser repetitiva
Eram **9 efeitos** e a casa mostra **3 de cada vez** — via-se um terço do baralho
por visita. Agora **24 efeitos com pesos** (`weight`: os dramáticos raros, os
pequenos comuns) e **18 tipos de efeito**, 9 deles novos:
`all_drink` · `leader_drink` (impostos a quem vai à frente) · `drink_per_card` ·
`last_advance` (prémio a quem vai em último) · `steal_card` · `trade_cards`
(trocar a mão) · `shield` · `swap_leader` (golpe de estado) · `skip`.
Também se corrigiu um defeito silencioso: o fallback em memória **esmagava os
pesos para 1**, por isso os pesos não faziam nada sem BD. Novo
`test/board-evento.test.js` (7 casos, um por efeito novo + banco coerente).

### Verificação
- `npm test`: **44 → 58**. Suite corrida **4×** (os duelos são aleatórios) — os
  testes que assumiam o vencedor passaram a normalizar o tipo de duelo primeiro.
- `npm run check` (58 + build) ✓ · smoke pela rede contra a Supabase: duelo de
  cara-ou-coroa, aposta aceite e **invisível** antes do fim, moeda lançada no
  servidor, vencedor certo.
- BD sincronizada: **24 eventos ?? com 18 efeitos distintos**, 49 board_items.

## 2026-09-01 (c) — Supabase em dia: schema aplicado e conteúdo semeado

Com as credenciais à mão, ficou fechado o último ponto em aberto.

- **Antes de aplicar**, `prisma migrate diff --from-url` contra a BD real para ver
  exatamente o que mudava. Era tudo **aditivo** — nada apagado:
  `ALTER TYPE "BoardItemCategory" ADD VALUE 'regra'` · `prompts.tag` (nullable) ·
  tabela `room_snapshots` + 2 índices. Só depois se correu o `db push`.
- `db push` + `generate` + `db seed` ✓.

**Estado real da Supabase (conferido por query):**
- 18 game_types · **361 prompts** (leve 138 · picante 107 · hardcore 59 · caos 57)
- packs: aniversário 4 · despedida 4 · reencontro 4 (os outros 349 servem sempre)
- 3 prompts com buddy, 5 com duração · 34 board_items (10 regras)
- `room_snapshots` criada

> **361 e não 360:** há 1 prompt na BD que já não existe no código
> (`intrigas/picante`: "Faz de teu buddy, durante 3 jogadas, a pessoa que achas
> mais atraente nesta mesa."). O seed faz upsert, nunca apaga — é conteúdo válido,
> ficou. Se um dia quiseres a BD a espelhar o código ao milímetro, é preciso um
> passo de limpeza no `seed.js` (apagar o que não está no ficheiro) — decisão a
> tomar de propósito, não por acidente.

**Cadeia verificada ponta-a-ponta contra a Supabase, não só os comandos:**
1. servidor com `.env` → sala criada, pack "despedida" aceite (prova que a coluna
   `tag` está lá), 8 tipos sorteados em 12 voltas, 5 prompts todos diferentes
   (prova o saco anti-repetição a correr sobre a BD), zero avisos no log;
2. passados 15s, a gravação profunda apareceu na tabela `room_snapshots`;
3. servidor morto + **ficheiro local apagado** (simula um deploy que troca de
   máquina) → arranque novo: `salas recuperadas {origem: "bd"}`;
4. `rejoin_room` com o id do jogador → religou, com sala, pack e 2 jogadores.
5. Linhas de teste limpas da Supabase no fim.

**Nota:** a password da BD passou por uma conversa de chat. Vale a pena rodá-la no
dashboard da Supabase (Settings → Database → Reset password) e atualizar o `.env`
local e as variáveis do Railway.

## 2026-09-01 (b) — Snapshot na Postgres + SQL da BD regenerado

Os dois pontos que tinham ficado em aberto na sessão anterior.

### 1. Snapshot deixa de morrer com a máquina
O retrato das salas só existia em ficheiro — cobria reinícios do processo e do
container, mas não um deploy que trocasse de máquina (o disco fica para trás).

- `prisma/schema.prisma`: modelo **`RoomSnapshot`** (`code` PK, `data` Json,
  `saved_at`). Estado efémero, não histórico: uma linha por sala, substituída a
  cada gravação e apagada quando a sala acaba ou passadas 6h.
- `snapshot.js` passa a ter **dois destinos**, de propósito: ficheiro a cada 5s
  (instantâneo, salva o dev e o `--watch`) e BD a cada 15s (mais cara, mas é a
  única que sobrevive entre máquinas). No arranque a BD manda e o ficheiro entra
  para as salas que ela não tinha. Gravação profunda também no SIGTERM — que é
  exatamente o sinal de um redeploy.
- Falhar a BD (ex.: ainda sem `db push`) **não perde nada**: o ficheiro continua
  a fazer o trabalho e o jogo nem dá por isso.
- `repo.prismaClient()` exposto para o snapshot reutilizar a MESMA pool.

**Dois defeitos apanhados pelo smoke de arranque** (e corrigidos):
- o autosave arrancava *antes* da recuperação — se o timer disparasse primeiro,
  gravava por cima com a memória ainda vazia. Passou para depois do restore;
- um `EADDRINUSE` era engolido pelo safety net do `uncaughtException` e ficava um
  processo vivo sem servir ninguém. Agora morre com exit 1 e log próprio.

### 2. Os SQL da pasta db/ deixam de derivar
`01_schema.sql` e `02_seed.sql` tinham ficado para trás: enum de intensidade só
com leve/picante, prompts sem `buddy`/`duration`, seed nos 4 tipos originais.

- **`db/generate.mjs`**: gera-os das fontes de verdade — estrutura de
  `prisma/schema.prisma` (via `prisma migrate diff`, **offline**, sem tocar em
  nenhuma BD) e conteúdo de `content/prompts.data.js` (o mesmo banco do seed).
- O `01_schema.sql` passa a ser **"cria OU atualiza"**: a seguir aos CREATE
  idempotentes emite `ADD COLUMN IF NOT EXISTS` para cada coluna e
  `ADD VALUE IF NOT EXISTS` para cada valor de enum — põe em dia uma BD antiga
  sem apagar nada e sem precisar do Prisma.
- `02_seed.sql`: **18 tipos, 360 prompts**, com `buddy`/`duration`/`tag`. Ids
  derivados do texto (determinísticos) + `ON CONFLICT` → idempotente.
- Scripts novos: `npm run db:sql` (regenera), `npm run db:push`,
  **`npm run db:sync`** (push + seed, o caminho de uma linha só).
- `db/README.md` reescrito: caminho com `.env` e caminho pelo SQL editor.

### Verificação
- `npm test`: **37 → 44**. Novos: `snapshot.test.js` (ficheiro; BD com um Prisma
  falso que serializa como uma coluna Json a sério; quem ganha quando os dois têm
  dados; e uma BD sem a tabela não pode partir o arranque) e `db-sql.test.js`
  (o `02_seed.sql` no disco tem de ser igual ao que o gerador produz — se mexeres
  no conteúdo e não correres `npm run db:sql`, falha aqui).
- Smoke real: sala criada e a jogar → servidor morto → servidor novo noutra porta
  → **sala recuperada**, pela ordem certa (restore → autosave → listen).
- `prisma validate` ✓ · `npm run check` (44 testes + build) ✓.

### Continua por fazer (precisa de credenciais)
O `db push`/seed contra a Supabase **não foi corrido**: esta máquina não tem
`server/.env` (é gitignored e ficou na outra). Fica a um comando:
`cd server && npm run db:sync` — ou colar `db/01_schema.sql` + `02_seed.sql` no
SQL editor da Supabase, que não precisa de credenciais locais nenhumas.

## 2026-09-01 — Pacote pré-playtest: 7 jogos novos + fundações de festa

Sessão grande, a 10 dias do playtest. Três frentes: tapar os buracos que se
notariam logo na primeira noite, dar à Roda os jogos de MESA INTEIRA que lhe
faltavam, e tratar do que faz um jogo de festa parecer um jogo de festa.

### Buracos tapados (eram os mais visíveis)
- **Prompts repetiam-se.** `content/bag.js`: saco por sala e por tipo — um desafio
  não repete enquanto houver conteúdo novo; quando esgota, repõe-se. Usado pela
  Roda, pelo Tabuleiro e pelo Torneio.
- **Ecrã apagava-se a meio.** `device.js: keepScreenAwake` (wake lock, com novo
  pedido no `visibilitychange` — o browser larga-o em segundo plano).
- **Não era instalável.** `public/manifest.webmanifest` + `sw.js` (rede primeiro,
  cache só como último recurso) + ícones PNG gerados sem dependências.
- **Reinício do servidor apagava as salas.** `snapshot.js`: gravação atómica a cada
  5s + no SIGTERM, recuperação no arranque. Verificado a sério: matei o servidor a
  meio de uma ronda de Desenho e o jogador religou na mesma ronda.

### Jogos novos (o catálogo era quase todo "o jogador da vez")
- **Roda:** Eu Nunca · Mais Provável · Termómetro · Quem Disse (`game/grupo.js`,
  mesma forma: todos respondem em segredo, revela-se de uma vez) · Cascata
  (`game/cascata.js`) · Desenha e Adivinha (`game/desenho.js`) · Reação.
- **Torneio:** duelo de Reação (4.º tipo; sem conteúdo, por isso nunca repete).
- **Tabuleiro:** casa ⚡ Reação (duelo contra adversário sorteado).
- Motor da reação (`game/reacao.js`) é PURO e partilhado pelos três modos: o GO
  tem atraso aleatório e é decidido pelo servidor — sem isso não havia corrida justa.
- Conteúdo: **11 → 18 tipos, 232 → 360 prompts**.

### Fundações
- **Curva de intensidade** (`game/intensity.js`): a votação passa a ser o TETO da
  noite; começa leve e sobe (~12 rondas ou 25 min). Ligável pelo host.
- **Packs temáticos** (aniversário/despedida/reencontro): `tag` no prompt, aditivo
  (um prompt sem tag serve sempre), CRUD na /admin, coluna no schema.
- **Identidade transversal** (emoji + cor) escolhida no lobby e usada na Roda, no
  chat, no pódio e como peão do Tabuleiro (que passa a saltar a fase de escolha).
- **Feed de eventos** (`feed.js`) no `room_state`, com painel nos três modos.
- **Pausa do host**: middleware de socket recusa ações com a sala em pausa, e o
  `clock.js` congela os cronómetros do cliente (senão a pausa era decorativa).
- **Auto-resolve** (`autoresolve.js`): assinatura de progresso por sala; se nada
  mexer, resolve-se a ronda pela via que o jogo já usava (quem não age, bebe) e
  segue. Desliga-se com `AUTO_RESOLVE_MS=0`.
- **Modo TV** (`watch_room` + `pages/Display.jsx`, `/?tv=CODIGO`): entra em
  só-leitura, não ocupa lugar, recebe o mesmo payload já anonimizado.
- **Legibilidade de bar**: texto grande + alto contraste (⚙️), guardados no telemóvel.
- **Música ambiente** com ducking (baixa quando toca um efeito).
- **Cartão de resultados PNG** partilhável nos três ecrãs de fim.
- **Ecrã de regras** durante o jogo (por modo e por mini-jogo).
- **Voltar a jogar**: nome/emoji/cor e salas recentes em `localStorage`.

### Verificação
- `npm test`: **24 → 37**. Novos: `grupo-novos.test.js` (invariantes dos 7 tipos —
  respostas e autor nunca no broadcast) e `socket-e2e.test.js` (**pela rede, com
  socket.io-client**: identidade, pausa a recusar pacotes, modo TV, votação de
  grupo e a palavra do Desenho por canal privado).
- `bots-e2e` alargado: os bots exercitam as **14 mecânicas** da Roda, ≥30 rondas.
- `npm run check` (37 testes + build) ✓ · servidor real: /health, manifest, sw e
  `?tv=` a 200 · snapshot verificado com reinício a meio de uma ronda.

### A seguir
- **Falta correr `prisma db push` + seed** para a coluna `tag` e os 128 prompts
  novos chegarem à Supabase. Sem isso o jogo corre na mesma (cai para o conteúdo
  em código), mas os packs não são editáveis na /admin.
- O snapshot vive no disco do container: cobre reinícios, não um deploy que troque
  de máquina. Passo seguinte seria guardá-lo na Postgres.

## 2026-08-22 — socket.js: handlers do Tabuleiro num módulo

- `socket/boardHandlers.js` — `registerBoardHandlers(socket, ctx)` recebe os helpers
  partilhados (`io`/`requireRoom`/`broadcastState`/`handleError`) e regista os 12
  eventos `board_*`. Corpos byte-idênticos (prova: 0 linhas de código diferentes).
- `socket.js` **630 → 561**; chama `registerBoardHandlers` no `connection`.
- **Nota:** os handlers da Roda ficam inline (mexem nos emits privados —
  `announceSpin`/`announceIntrigasReason` — e o `socket.js` não tem teste direto).
  Extraí-los é um passo opcional, melhor com um harness de socket primeiro.
- **Verificação:** todos os 12 `board_*` continuam registados; `socket.js` carrega;
  `npm test` 13/13.

## 2026-08-22 — Modularização do board.js (motores das casas)

Mesma abordagem: `board/core.js` partilhado PRIMEIRO (evita imports circulares
board.js ↔ motores), depois os 3 motores. Protegido pelo `board-e2e.test.js`.

- `board/core.js` — `requireBoard`, `nameOf`, `weightedPick/Sample`, `giveRandomCard`,
  `checkWin`, `applyPrison`, `activeIds`, `advanceBoardTurn`, `MINI_DRINK`,
  `KNOWN_CARD_KEYS`. Usado pelo board.js E pelos motores.
- `board/blackjack.js` (draw/handValue/openBlackjack/positiveReward/resolve/
  boardBlackjack/standResult; exporta `handValue` p/ o serializePending).
- `board/beerpong.js` (tabelas + `boardBeerpong`).
- `board/evento.js` (openEvento/applyEventoEffect/boardEventoPick — casa ??).
- `board.js` importa `openBlackjack`/`openEvento` (usados no `advance`) e **re-exporta**
  `boardBlackjack`/`boardBeerpong`/`boardEventoPick` p/ socket.js/bots.js.
- **`board.js`: 886 → 530 linhas.**
- **Verificação:** `npm test` 13/13 (o e2e do tabuleiro apanhou um `handValue` em falta
  no serializePending — corrigido exportando-o); prova de que **0 linhas** se perderam/
  alteraram (só movidas); a cadeia carrega em runtime; re-exports ✓.
- **A seguir:** `socket.js`.

## 2026-08-22 — game.js: Intrigas + Segredos extraídos + BOTS do Tabuleiro

Continuação da modularização do servidor + bots para o outro modo.

- `game/intrigas.js` — `setupIntrigas`, `chooseTarget`, `submitRps`, `RPS_BEATS`,
  `serializeIntrigas`. `game.js` re-exporta `chooseTarget`/`submitRps` p/ o socket.
- `game/segredos.js` — `pickSecret`, `setupSegredos`, `castGuess`, `revealSegredos`,
  `serializeSegredos`. `game.js` importa `revealSegredos` (revealResult) e re-exporta
  `castGuess`. O setup passou de inline (no `spinWheel`) para funções nos módulos.
- **`game.js`: 650 → 509 linhas** (os 4 mini-jogos da Roda estão agora em módulos).
- **Bots do Tabuleiro** (`bots.js` + `board.js` exporta `PAWNS`): `driveBoardBots`
  escolhe peão → lança ordem → na sua vez resolve a casa (mini/gamble/blackjack/
  beerpong/??) ou avança 1–3. Deixou de ser TODO.
- Novo teste `test/board-e2e.test.js`: bots correm o tabuleiro até ao fim (vencedor)
  sem encravar nem expor cartas.
- **Verificação:** `npm test` **13/13** (Roda + Tabuleiro e2e + invariantes); prova de
  código idêntico das ações movidas (pickSecret/chooseTarget/submitRps/castGuess/
  revealSegredos/RPS_BEATS todas iguais); `socket.js` carrega a cadeia; re-exports ✓.
- **A seguir (backlog):** modularizar `board.js` (886) e `socket.js` (630).

## 2026-08-22 — Modularização do servidor: helpers + Piramide + Vasco (game.js)

Primeiro passo no servidor (o mais delicado — state machines). Rede reforçada
PRIMEIRO: o smoke dos bots virou **teste permanente** (`test/bots-e2e.test.js`)
que joga todas as mecânicas da Roda ponta-a-ponta (spin/aceitar/votar/adivinhar/
RPS/piramide/vasco) — se algo partir ou encravar, `npm test` falha.

- `game/helpers.js` — `connectedOrder`, `nameOf`, `statsFor`, `drink`, `shuffle`
  (puros, sem ciclos). `game.js` e os módulos importam daqui.
- `game/piramide.js` — motor completo (baralho, deal, flip/assign/pass/respond,
  summary, hand) + `serializePiramide(base, r)`. `game.js` importa `dealPiramide`/
  `serializePiramide` e **re-exporta** as ações para o `socket.js` (interface intacta).
- `game/vasco.js` — motor completo (deal, pistas, votação, redenção, resultado) +
  `serializeVasco`. `game.js` importa `dealVasco`/`tallyVascoVotes`/`buildVascoResult`/
  `serializeVasco` e re-exporta as ações. Depende de `../repo.js` (quadros).
- **`game.js`: 1125 → 650 linhas.** `PIRAMIDE_SHARE`/`pickWeightedType` ficam no core.
- **Verificação:** `npm test` 12/12 (incl. e2e + invariantes de anonimato de ambos);
  prova de código idêntico vs git (Piramide 210=210, Vasco 135=135 linhas, multiset
  igual); `socket.js` carrega toda a cadeia de imports/re-exports em runtime ✓;
  `npm run check` (build 515) ✓. **A interface do `socket.js` não mudou** (re-exports).
- **A seguir (backlog):** Intrigas/Segredos do `game.js`, depois `board.js`/`socket.js`.

## 2026-08-22 — Modularização do Board.jsx (overlays/mini-jogos extraídos)

Mesma abordagem gradual + verificada. Overlays do Modo Tabuleiro extraídos para
`client/src/pages/board/`:
- `blackjack.jsx` — `PlayingCard`, `bjValue`, `FlipDealerCard`, `BlackjackReveal`
  (PlayingCard e BlackjackReveal exportados; usados pela mesa de blackjack do Board).
- `reveals.jsx` — `GambleReveal`, `CardPlayReveal`, `OrderReveal`.
- `Beerpong.jsx` — `Beerpong` (+`BP_ROWS`).
- `EventoOverlay.jsx` — casa "??" (3 cartas + flip).
- Ficam no `Board.jsx` as constantes só dele (`KIND_ICON`/`GAME_EMOJI`/`squareIcon`/
  `ADVANCE`) e o componente principal.
- **`Board.jsx`: 1173 → 603 linhas.** Mudança puramente estrutural.
- **Verificação:** `npm run check` ✓ (11 testes, build **515 módulos**); prova de
  código idêntico (524=524 linhas, multiset igual ao original em git); sem fugas de
  scope (nenhum módulo usa identificadores só-do-Board). Servidor intocado.
- **A seguir (backlog):** modularizar o servidor (`game.js`/`board.js`/`socket.js`),
  protegido pela suite de testes.

## 2026-08-22 — Modularização do Game.jsx concluída (cartas restantes extraídas)

Continuação do #2. Extraídas as cartas que faltavam para `client/src/pages/games/`:
- `GuessingCard.jsx` (Segredos), `PiramideCard.jsx` (+ `PlayingCard`/`PyramidBoard`/
  `RED_SUITS`), `VascoCard.jsx` (Impostor). Cada uma importa `CardShell` de `shared.jsx`,
  `sfx`, e (Piramide/Vasco) `confetti/haptic`. Exports nomeados, como o `cards.jsx`.
- **`Game.jsx`: 1203 → 600 linhas** (do original 1501). Passou a orquestrador: fases,
  roda, prep, flash, players strip, game-over — os mini-jogos vivem em módulos.
- Sem alteração de comportamento (mudança puramente estrutural). Removido o import de
  `CardShell` já não usado no `Game.jsx`.
- **Verificação:** `npm run check` ✓ (11 testes, build **511 módulos**). Nenhuma
  mudança no servidor. Falta ainda modularizar `Board.jsx` e o servidor (backlog).

## 2026-08-21 — Ronda de robustez pré-playtest: testes, hardening, bots, timer, modularização

Sessão de melhoria de código a pedido do João ("faz tudo o que sugeriste"). 10 itens,
cada um verificado (testes + build). Foco: proteger as Regras de Ouro durante o
desenvolvimento rápido à volta do playtest.

- **#1 Suite de testes (`server/test/*.test.js`, `npm test`):** node:test, 11 testes.
  Invariantes críticos: autor de Segredos nunca no payload; mãos de Piramide/Vasco e
  palavra/impostor do Vasco fora do broadcast; rotação salta desligados/eliminados;
  vidas→0 elimina + auto-fim; cartas do tabuleiro privadas; sanitize/throttle.
- **#3 Hardening de input (`util.js`):** `sanitizeText` (tira controlo, colapsa espaços,
  limita) aplicado a nomes/chat/perguntas/segredos; `throttled` (chat 400ms, submissões
  150ms) contra spam/duplo-toque.
- **#5 Log + robustez (`log.js`):** logger estruturado (níveis via LOG_LEVEL);
  `unhandledRejection`/`uncaughtException` já não deitam o servidor abaixo; `disconnect`
  protegido; `repo.js` usa `log.warn` no fallback de BD.
- **#4 Sessão em localStorage (`App.jsx`):** espelho do sessionStorage — sobrevive ao
  browser matar o separador (comum no telemóvel); sem partir 2-separadores em dev.
- **#6 Bots de playtest (`bots.js`, gated por `ENABLE_DEV_BOTS=1`):** enchem a sala e
  jogam TODAS as mecânicas da Roda à vez (spin/aceitar/votar/adivinhar/RPS/piramide/
  vasco). Botão "🤖 +bot" no lobby (só em `npm run dev` ou `?dev`). Tabuleiro = TODO.
  Smoke: 413 rondas por todas as fases, sem encravar e sem fugas.
- **#8 Timer Boca Calada (`components/Timer.jsx`):** anel de 20s, tiques + buzina;
  pressão visual (não força ação). Sons `tick`/`timeout` em `sfx.js`.
- **#10 UX de entrada tardia (`Home.jsx`):** painel amigável (emoji+dica) p/ "jogo já
  começou" / nome repetido / sala inexistente.
- **#9 Segurança:** `.env.example` passa a documentar `ADMIN_PASSWORD`/`LOG_LEVEL`/
  `ENABLE_DEV_BOTS`; confirmado que não há segredos commitados e que `admin.js` bloqueia
  (503) sem password. **Operacional (João):** rodar a password da Supabase que passou
  pelo chat (log de 2026-08-18).
- **#7 `npm run check` (root `package.json`):** um comando = testes do servidor + build
  do cliente.
- **#2 Modularização (1.º incremento):** `pages/games/shared.jsx` (TYPES/CardShell/
  BuddyBlock) + `pages/games/cards.jsx` (PromptCard/ChoiceCard/IntrigasCard, reusados
  pelo Demo). `Game.jsx` 1501→1203 linhas. Padrão estabelecido; falta extrair
  Guessing/Vasco/Piramide (gradual — ver backlog).
- **Decisões pendentes #3/#4/#5 fechadas** (ver roadmap): conteúdo fixo (só /admin);
  salas do zero; Boca Calada com timer.
- **Verificação:** `npm run check` ✓ (11 testes, build 508 módulos); smoke dos bots
  (413 rondas, sem fugas) ✓; servidor arranca + `/health` 200 + logger estruturado ✓.

## 2026-08-20 — Tabuleiro sai de beta: bancos na BD + cartas privadas + fim com stats

Fecha o polish (#3) e as melhorias (#4) do tabuleiro. Só falta o playtest real.

- **Bancos ??/prisão/cartas → dados/BD (`board_items`):** novo `content/board.data.js`
  (fonte única, fallback) + modelo Prisma `BoardItem` (enum `BoardItemCategory`
  evento/prisao/carta; `@@unique([category,title])`) + `repo.getBoardBanks()` (BD com
  fallback, como o resto do `repo.js`). O `initBoard` **fotografa** os bancos para
  `b.banks` — os handlers síncronos leem-nos sem `await`. Os efeitos do **??** passam a
  **tipados** (`advance|back|drink|card|prison|others_drink` + `value`); removidos os
  closures `EVENTO_POOL`/`applyEvento`/`giveCard`. Prisão = efeitos combinados
  (`skipTurns/drink/back/loseCard`, escolha ponderada). Cartas = catálogo (mecânica
  fixa por `key`, só metadados editáveis). `giveRandomCard` centraliza dar cartas
  (?? / blackjack / beer pinga) e respeita o catálogo ativo + pesos.
- **Admin (`/admin`) separador 🎲 Tabuleiro:** CRUD dos 3 bancos (form adapta-se à
  categoria) — `admin.js` (rotas `board-items` + validação) + `repo.js` (CRUD) +
  `admin.html` (UI). Sem BD/tabela → mostra erro e o jogo usa o fallback.
- **Cartas PRIVADAS:** `serializeBoard` deixa de enviar `cards` (só `cardCount`); a
  mão de cada jogador vai por `board_hand` (emitido no `broadcastState` a cada jogador
  ligado — cobre advance/jogar/ganhar/reconexão). Cliente: `App.jsx` (estado+listener,
  passa `myHand`), `Board.jsx` (usa `myHand`; outros mostram 🎴×N).
- **Ecrã de fim com estatísticas + animação:** contadores `prisonCount`/`cardsPlayed`;
  "prémios" (🍺 Rei da Golada · 🚔 Preso Habitual · 🎴 Maquiavélico) + classificação
  final; vencedor com coroa a pulsar, entradas em stagger.
- **SQL standalone:** novo `server/db/03_board_items.sql` (schema + seed idempotente,
  autocontido) para o colega correr sem Prisma. `prisma/seed.js` também semeia os itens.
- **Docs:** README reescrito (estado atual, 2 modos, admin, deploy, BD); roadmap S4 +
  `board-mode.md` (nova Fase 4) atualizados.
- **Verificação:** smoke do motor (bancos em fallback, ?? tipado advance/card, prisão
  conta, serialização esconde cartas+?? e traz stats, `boardHand`) ✓ · `prisma validate`
  + `generate` ✓ · client build (505 módulos) ✓ · server `/health` 200 + `/admin` 200 +
  API 401 sem password ✓. (BD real: falta o colega correr `db push`+seed da `board_items`;
  até lá corre no fallback em código.)

## 2026-08-20 — /admin vira dashboard + showroom de demos dos mini-jogos

Pedido do João: secção no /admin só com "demos" dos mini-jogos/eventos (tabuleiro e
roda) para confirmar o aspeto sem começar um jogo.

- **Showroom no CLIENTE (sem drift):** `client/src/pages/Demo.jsx` renderiza os
  **componentes reais** com dados fictícios. Acede-se via **`?demo`** (routing em
  `main.jsx`: `?demo` → `<Demo/>`, offline, sem socket).
  - **Tabuleiro:** conduz o `<Board>` real com `room`/`board` mock para ~21 cenas —
    escolher peão, ordem, a-tua-vez (cartas+avançar), Desafio, Isto/Aquilo, ?? (escolher
    + revelado sorte/carta/preso), Gamble (apostar/ganhou/perdeu), Blackjack (mesa/
    ganhou/perdeu), Beer Pinga (apontar/jackpot/afogado), carta usada, ganância, fim.
  - **Roda:** exportei `PromptCard`/`ChoiceCard`/`IntrigasCard` de `Game.jsx` e mostro
    Boca Calada, Desafio, Isto ou Aquilo, Intrigas com rounds mock.
  - Botões de ação são só visuais (handlers no-op); "← Sair" volta à lista.
- **`/admin` agora é DASHBOARD** (`server/src/admin.html`): separadores **📋 Conteúdo**
  (o CRUD de sempre) e **🎮 Demos** (iframe da app em `?demo=1`). Campo "URL do cliente"
  (default = mesma origem; em dev aponta p/ Vite :5173, persistido em localStorage) +
  "Abrir em nova aba". Sem alterar a API/auth.
- **Verificação:** client build ✓; servidor serve `/admin` (dashboard) e `/?demo=1`
  (SPA em modo demo) ✓. As roda-restantes (Segredos/Pirâmide/Vasco) ficam para acrescentar
  (multi-passo — precisam de mais scaffolding de mock).

## 2026-08-20 — Tabuleiro P0: anti-deadlock + controlos de host

Tirar o tabuleiro de "beta": robustez a desconexões + controlos de host (era o único
grupo que é bug de fiabilidade — um telemóvel a cair congelava o jogo todo).

- **Anti-deadlock (`board.js`):** `boardOnDisconnect` trata TODAS as fases — pawn/order
  desbloqueiam se os restantes ligados já escolheram/lançaram (`finalizeOrder` extraído
  de `rollOrder`); em playing, se o **jogador da vez sai**, limpa o `pending` dele e
  passa a vez. `boardOnReconnect`/`boardEnsureCurrent` devolvem o turno se ficou sem dono.
  **Fix** em `advanceBoardTurn`: quando o atual já não está na lista (saiu/expulso) o
  `idx` era forçado a 0 e saltava o primeiro — agora começa correto (`-1 → 0`).
- **Controlos de host (`board.js` + `socket.js`):** `board_skip` (saltar vez AFK),
  `board_end` (terminar → over, vencedor = quem está mais à frente), `board_kick`
  (expulsar quem JÁ saiu — remove da sala e da corrida). Todos com `requireHost`.
- **Ligações (`socket.js`):** `disconnect` → `boardOnDisconnect`; `rejoin_room` →
  `boardOnReconnect`. **`App.jsx`/`Board.jsx`:** emitters `onSkip/onEnd/onKick`; barra
  de host (Saltar vez · Terminar); classificação mostra desligados 📴 esbatidos + botão
  "expulsar" (host); cabeçalho "À espera de jogadores…" quando não há vez.
- **Entradas a meio:** já protegidas — `joinRoom` recusa com status ≠ lobby; `initBoard`
  cria entrada para todos os do lobby. Sem trabalho extra além da reconexão.
- **Verificação:** smoke do motor (desconexão em ordem/playing, reconexão, skip/end/kick,
  não-host recusado) ✓ · **e2e socket** (3 clientes: jogador da vez desliga → turno passa
  sozinho · host expulsa · salta · termina) ✓ · client build ✓.
- **Falta do P0 (não codificável):** playtest real + afinar números (ritmo 60 casas,
  golos, odds ??/blackjack/beer pinga, dureza da ganância) — depende de jogar a sério.

## 2026-08-20 — Nova casa "Beer Pinga" (beer pong interativo)

Pedido do João: mini-jogo de beer pong super interativo e festivo.

- **Servidor (`board.js`):** nova casa `beerpong` (3 casas). Ao cair → `pending`
  `{kind:'beerpong'}`. **`boardBeerpong(room, pid, power)`** — a **força (0..1)**
  escolhe a fila: <0.45 frente · <0.8 meio · ≥0.8 trás (timing preciso). **Acerta
  sempre**; sorteia um copo dessa fila (`BEERPONG_OUTCOMES`). **Nunca neutro:** bebe
  sempre a **base** (2/3/4 golos por fila) e o copo agrava/recompensa (avança · carta ·
  os outros bebem · +golos · recua · prisão · JACKPOT avança 3+carta). `lastEvent.beerpong`
  = {row, base, emoji, title, desc, good}. Servidor é a autoridade (cliente só manda a força).
- **`socket.js`:** `board_beerpong`. **`App.jsx`:** emitter `onBeerpong`.
- **Cliente (`Board.jsx`):** componente `Beerpong` — mesa em perspetiva (clip-path) com
  copos em pirâmide 🥤 (3/2/1), **medidor de força a oscilar** (zonas Perto/Médio/Longe),
  botão Atirar; a bola faz **arco** até à fila e o copo **abre com a revelação** (emoji +
  consequência, verde/vermelho) + som/confetti. Espectadores veem "X está a apontar" e a
  revelação. Casa na pista: 🏓 / `bg-sky-500/15`.
- **Verificação:** smoke do motor (dist 60 c/ 3 beerpong · força→fila · base sempre bebida ·
  nunca neutro · 60 lançamentos aleatórios) ✓ · client build ✓.

## 2026-08-19 — Gamble animado + pista maior + carta usada + fix "undefined"

Updates + bugs do João.

- **BUG "undefined" (corrigido):** o cabeçalho `Vez de …` e a mesa de blackjack liam
  `currentPlayer?.pawn` de `room.players` (que NÃO tem peão — está em `b.players`),
  e num template literal isso renderiza a string "undefined". Passa a usar
  `currentPawn = b.players[currentPlayerId]?.pawn`.
- **Gamble com animação:** servidor manda `lastEvent.gamble.result` (win/lose/pass);
  novo `GambleReveal` (inline) mostra um **dado a girar** (~1,3s) antes de revelar o
  desfecho (🎉/💥) + som/confetti. Já não é instantâneo.
- **Carta a ser usada → animação para todos:** servidor manda `lastEvent.card`
  (emoji, nome, quem, alvo, blocked) no `playCard`; novo `CardPlayReveal` — banner
  **flutuante `pointer-events-none`** (nunca bloqueia toques) que mostra a carta a
  entrar com flourish, para toda a gente, e desaparece ~2,1s.
- **Pista maior:** casas `w-11 → w-14`, ícones `text-lg → text-2xl`, peões maiores.
- **Ecrã final "não dá para fazer nada":** investigado a fundo — o fluxo
  `over → Jogar outra vez/Sair` está **verificado por e2e** (2 clientes jogam até dar
  a volta; `reset_game` → `back_to_lobby` + lobby + board limpo ✓). Não reproduzi bug
  de lógica; os overlays estão todos protegidos por fase. Reforço defensivo:
  `relative z-10` no ecrã de fim. (Se persistir, é preciso repro do device.)
- **Ficheiros:** `server/src/board.js` (gamble/card structured), `client/src/pages/Board.jsx`.
  Verificação: e2e fim-de-jogo + reset ✓ · smoke do motor prévio ✓ · client build ✓.

## 2026-08-19 — Blackjack: revelação animada (carta a carta)

Pedido do João: a casa não mostra logo o resultado — vira a carta tapada e vai
**puxando cartas uma a uma** (com animação + som) até ao desfecho. Só cliente
(`client/src/pages/Board.jsx`): novo `BlackjackReveal` remonta a cada resultado
(`key=text`); a carta tapada faz flip 3D (`FlipDealerCard`), os hits entram a
deslizar (~750ms cada), o total da casa sobe em direto, e só no fim aparece o
banner (win/push/lose) + consequência, com o som/confetti a disparar aí (saíram
do efeito imediato antigo). **Toca para saltar.** `bjValue` no cliente = servidor.
Correção da pista (auto-scroll) mantida. Client build ✓.

## 2026-08-19 — Tabuleiro: revelação da ordem + pista em linha auto-scroll

Dois pedidos do João.

- **BUG do dado (corrigido):** o último a lançar não via o seu dado — o servidor
  passa a `playing` no instante do último lançamento e o tabuleiro aparecia logo.
  Fix (só cliente): novo overlay **`OrderReveal`** que, ao detetar a transição
  `order → playing`, mostra a todos os **dados + a ordem (quem começa)** por ~2,8s
  (com tap para continuar) antes da corrida. Sem alterar o servidor (a ordem já
  estava certa). Timer depende só do *edge* de `b.phase` → não fica preso.
- **Pista "em linha" (voltou):** substituí a grelha em S pela **tira horizontal**
  original, mas agora com **auto-scroll a seguir o jogador da vez** (centra a casa
  atual via `scrollBy` calculado por `getBoundingClientRect` — scroll SÓ da tira,
  nunca da página). Sem scroll manual. Peões continuam a deslizar (`layoutId`) e a
  casa atual a pulsar.
- **Ficheiros:** `client/src/pages/Board.jsx`. Client build ✓.

## 2026-08-19 — Tabuleiro em S (serpentina)

Pedido do João: a grelha parecia um calendário. Passou a **serpentina (S)** — as
linhas ímpares invertem o sentido (esq→dir, dir→esq…), dando um percurso contínuo
tipo caminho de jogo de tabuleiro. `BOARD_COLS = 6`; posição de cada casa calculada
com `gridColumn/gridRow` (linha par = normal, ímpar = espelhada). Peões continuam a
deslizar (`layoutId`) e o auto-scroll segue a casa da vez. Só cliente
(`client/src/pages/Board.jsx`). Alternativa "anel do Monopólio" descartada: para 60
casas dava 16×16 com centro vazio e casas minúsculas no telemóvel. Client build ✓.

## 2026-08-19 — Tabuleiro: fix jogada final + Blackjack + 60 casas + ganância

Pedidos do João (troubleshooting + updates).

- **BUG jogada final (corrigido):** o `EventoOverlay` prendia-se a cobrir o ecrã
  (`fixed inset-0 z-50`) e os botões deixavam de responder. Causa: o `useEffect` da
  revelação dependia do objeto `reveal` (recriado a cada `room_state`), por isso cada
  broadcast limpava o `setTimeout` **sem o rearmar** → nunca escondia. Fix: efeito
  depende só de `revealKey` (string estável) + **tap para fechar** + `AnimatePresence`
  interno (deixou de ficar montado por fora). `client/src/pages/Board.jsx`.
- **Ver o tabuleiro inteiro + seguir o ritmo:** a pista horizontal deu lugar a uma
  **grelha responsiva** (`repeat(auto-fill, minmax(2.5rem,1fr))`) dentro de um cartão
  scrollável (`max-h-34vh`) que faz **auto-scroll à casa do jogador da vez**
  (`scrollIntoView`). Peões continuam a deslizar (`layoutId`) e a casa atual pulsa.
- **Casa Blackjack (nova):** `kind:'blackjack'` (3 casas). Bate a "casa" (dealer saca
  até 17): `openBlackjack` → `pending`, `boardBlackjack(action: hit|stand)`,
  `resolveBlackjack`. **Vitória = avança 2 + recompensa POSITIVA** (`positiveReward`:
  carta / todos bebem 2 / +1 casa) — equivalente ao ?? mas só coisas boas. Derrota/bust
  = bebe 3; empate = fica. `serializePending` **esconde a carta tapada do dealer** até
  ao stand. UI de mesa inline (nunca bloqueia o ecrã) + revelação das mãos finais.
  Evento `board_blackjack`, emitter `onBlackjack`.
- **Tabuleiro 60 casas** (era 45); +? e +gamble (6 ?? · 4 gamble · 3 blackjack · 46 mini).
- **Taxa de ganância:** andar **3 casas 2× seguidas** → `applyGreed` (evento de azar
  **99% mau** / 1% escapa: recua 3 · bebe 4 · bebe 6 · prisão), ignora a casa onde caiu.
  `fastStreak` por jogador + aviso no cliente ao 1º passo de 3. (A prisão por abuso —
  1 casa 3× — mantém-se.)
- **Ficheiros:** `server/src/board.js` (blackjack, ganância, 60, serializePending),
  `server/src/socket.js` (`board_blackjack`), `client/src/App.jsx` (emitter),
  `client/src/pages/Board.jsx` (grelha + auto-scroll, mesa de blackjack, fix overlay,
  aviso de ganância).
- **Verificação:** smoke do motor (60 casas + distribuição · blackjack hit/stand/bust ·
  serialização esconde dealer · ganância dispara e castiga · ?? regressão) ✓ · **e2e
  socket** (2 clientes: board → peões → dado → avanço → wiring do `board_blackjack`) ✓ ·
  client build ✓ · server `/health` ✓.

## 2026-08-19 — Tabuleiro: casa ?? interativa + animações

Pedido do João: pista deixa de estar colada ao topo, mais animações no tabuleiro,
e a casa **??** passa a ser uma escolha animada de **1 de 3 cartas viradas** que
faz **flip** a revelar a trait/carta.

- **Casa ?? (servidor `board.js`):** deixou de resolver automaticamente. Ao cair,
  `openEvento` gera **3 resultados virados** (`EVENTO_POOL`: 🚀 avança 2 · 💨 recua 2 ·
  🍺 bebe 3 · 🎴 carta nova · 🚔 prisão · 👯 todos bebem 2) e fica `pending.kind='evento'`
  (a vez só passa ao escolher). Novo **`boardEventoPick(room, pid, index)`** aplica o
  efeito da carta escolhida, revela em `lastEvent.evento {pickedIndex,emoji,title,desc,card}`
  e passa a vez. **Serialização esconde o conteúdo** das 3 cartas (só envia `count`) —
  surpresa real, sem batota. Removidos `applyEvento`/`giveCard` (substituídos).
- **`socket.js`:** handler `board_evento_pick`. **`App.jsx`:** emitter `onEventoPick`.
- **Cliente (`Board.jsx`):**
  - **Pista com respiro:** agora num cartão com label "Pista" e `mt-1` (já não colada
    à margem superior).
  - **Overlay da ??:** `EventoOverlay` — 3 cartas viradas a flutuar; o jogador da vez
    escolhe uma → **flip 3D** (`rotateY`) revela emoji/título/descrição; as outras
    esbatem. Espectadores veem "X está a escolher…" e a revelação. sfx.reveal + haptics
    + confetti (sorte/carta). Auto-fecha ~3.6s.
  - **Mais animações:** peões que **deslizam entre casas** (`layoutId` do framer-motion),
    **casa atual a pulsar** (glow em loop), texto de evento com pop (AnimatePresence),
    **dado a rolar** na fase de ordem, peões a entrar com spring, botões com `whileTap`,
    cartão de mini/gamble com entrada em spring.
- **Verificação:** smoke do motor (?? → 3 cartas · serialização esconde conteúdo ·
  só a vez escolhe · efeito aplicado · vez passa · índice inválido rejeitado · 40
  tentativas de todos os resultados) ✓. Client build ✓. Server arranca + `/health` ✓.

## 2026-08-19 — Modo Tabuleiro (Fase 1: motor + servidor)

Novo modo à parte da roda (spec em `reference/board-mode.md`). Fundação:
- **`server/src/board.js`:** tabuleiro de **45 casas** (1 Partida + 5 ?? + 3 Gamble
  + 36 mini-jogo distribuídas pelo **peso da roda** `pickWeightedType`, agora
  exportado). Estado por jogador (peão, pos, golos, slowStreak, skipTurns).
  Fases `pawn → order → playing → over`. **Avançar 1/2/3 casas = 2/4/6 golos**
  (sem vidas). **Vitória = dar a volta** (pos ≥ 45). **Prisão por abuso** (andar 1
  casa 3× seguidas → perde a próxima vez). Funções: initBoard, pickPawn, rollOrder,
  advance, serializeBoard.
- **`rooms.js`:** `room.mode` ('wheel'|'board'), `setMode` (host), serializa
  `mode` + `board`. **`game.js`:** `resetToLobby` limpa o board.
- **`socket.js`:** `set_mode`, `board_pick_pawn`, `board_roll`, `board_advance`;
  `start_game` ramifica por modo (board → `initBoard`; roda → `initGame`).
  `game_started` leva `mode`.
- **Verificação:** smoke do motor (45 casas + distribuição, peões únicos, ordem por
  dado, prisão por abuso salta a vez, volta = vitória) ✓. Modo dormente (a roda não
  muda) até haver UI.

**Fase 1 cliente (feita a seguir):** seletor de modo no lobby (host: 🎡 Roda / 🎲
Tabuleiro), `client/src/pages/Board.jsx` (fases pawn/order/playing/over: grelha de
peões, dado da ordem, pista scrollável de 45 casas com peões, classificação,
controlos avançar 1/2/3, feedback de prisão, ecrã de fim com vencedor + "bebeu
mais"). `App.jsx` liga o ecrã `board` e os emitters. **Tabuleiro jogável
ponta-a-ponta.** Verificação: **e2e socket** (modo→peões→dado→corrida→vitória) ✓,
client build ✓.

## 2026-08-19 — Modo Tabuleiro Fases 2+3 (casas + cartas)

- **Casas de mini-jogo:** ao cair, desafio **rápido single-player** — prompt de
  Boca Calada/Desafio (fazer ou beber 3 golos) ou dilema Isto ou Aquilo (escolher).
  Os jogos de GRUPO (Vasco/Intrigas/Segredos/Piramide) ficam na Roda (não cabem em
  "1 pessoa cai e faz"). `board.pending` bloqueia o fim da vez até resolver.
- **Casa ??:** efeito de sorte automático (avança/recua 2 · bebe 3 · ganha carta ·
  prisão · todos os outros bebem 2).
- **Casa Gamble:** aposta (50/50 avança 2 / recua 2) ou passa.
- **Prisão:** consequência **aleatória** (perde 1-2 vezes · bebe 4 · recua 3 · perde
  carta) além de perder a vez.
- **Cartas/traits:** inventário por jogador (ganhas em ??), 7 cartas jogáveis contra
  outros na tua vez (🔁⬅️⛓️⏭️🛡️🍺🎁); Escudo bloqueia a próxima carta. Públicas (MVP).
- **Ficheiros:** `board.js` (openMini/boardResolve/boardGamble/applyEvento/applyPrison/
  playCard/giveCard, serialização com pending/lastEvent/cards), `socket.js`
  (board_resolve/gamble/play_card; advance async), `App.jsx` + `pages/Board.jsx`
  (resolução das casas, feedback, inventário + jogar carta com alvo).
- **Verificação:** smoke do motor (mini/gamble/??/prisão/cartas+escudo) + **e2e
  socket** completo (corrida a resolver casas, jogar carta, até à vitória) ✓. Build ✓.

**A seguir:** playtest no browser (roda + tabuleiro). Melhorias possíveis: cartas
privadas, bancos de ??/prisão na admin, casas neutras, mais jogos rápidos.

---


---

## 2026-08-18 — Eliminação: telemóvel partido + espectador + último de pé

Pedido do João: quem fica sem vidas é **eliminado** (o jogo acaba para essa
pessoa) e passa a **espectador** com uma animação de **telemóvel partido**.

- **Servidor:** `player.eliminated` (novo campo, serializado). Na recusa fatal
  (Boca Calada/Desafio) lives→0 → `eliminated=true` (efeito `eliminated`, +1 shot
  nas stats). `connectedOrder` passa a contar só **ativos** (ligados e não
  eliminados) → eliminados saem da rotação e das votações (guards em
  chooseTarget/vascoVote/castGuess). **Auto-fim:** ao restar ≤1 ativo, o jogo
  termina e `finalStats.survivor` = último de pé (`game_over`). `initGame` limpa a
  eliminação (rematch).
- **Cliente:** `BrokenScreen.jsx` (vidro estilhaçado em SVG, shatter+tremor,
  pointer-events-none — vê através das fissuras) mostrado quando `you.eliminated`.
  Flash `💀 Sem vidas!`. Vote/guess do Vasco/Segredos escondidos para eliminados
  ("Estás fora — só a ver 🍿"). `GameOver` mostra o **🏆 sobrevivente**. Barra de
  jogadores esbate os eliminados.
- **Verificação:** smoke do motor (2 eliminações → auto-fim + survivor) + **e2e
  socket** (recusas até ao fim, `eliminated` no room_state, `game_over` com
  survivor) ✓. Client build ✓.

---

## 2026-08-18 — Vasco v3 (votação + redenção) + fixes (flash, roda) + sugestões

**Vasco v3** (pedido do João — o host tinha responsabilidades a mais, sobretudo
sendo ele o Vasco): substitui o host-arbitra por **votação do grupo**.
Fluxo: papéis → pistas → **`voting`** (todos votam quem é o Vasco, `vasco_vote`;
ninguém arbitra) → apura; se o mais votado for Vasco → **`redemption`**
(`vasco_redeem`: o Vasco apanhado escolhe a palavra do quadro para se safar) →
`result`. Escapou ou redimiu certo → +1 vida; apanhado e falhou → 5 golos; empate
na votação → Vascos escapam. Identidades só no `result`. Removido `vasco_judge`.
Ficheiros: `game.js` (vascoVote/tally/vascoRedeem/buildVascoResult, serialização),
`socket.js`, `App.jsx`, `Game.jsx` (VascoCard: voting/redemption/result).
Smoke (apanha+certo/errado, escapa) + **e2e socket** ✓.

**Fix flash −1/+1 vida:** estava centrado a tapar a roda no fim da ronda. Passa a
aparecer no **topo** (sobre os corações), com spring, fora da roda.

**Fix roda (mobile):** com 7 tipos os nomes transbordavam as fatias → a roda passa
a mostrar **só o ícone** (maior, centrado); o nome aparece no cartão quando para.

**Sugestões na preparação (💡 Sugerir):** banco curado de perguntas/segredos
(offline, sem chave) que preenche o campo — para os indecisos. Trocável por
geração com a API da Anthropic quando houver `ANTHROPIC_API_KEY`.

**Votação de intensidade (feito a seguir):** no lobby, **todos votam** a
intensidade (`vote_intensity`); no `start_game` o servidor apura (`tallyIntensity`:
maioria; empate ou sem votos → **sorteio**). `game_started` leva `intensityResult`
e o cliente mostra uma **roleta** (`IntensityReveal`, reusa a `Wheel`) que gira até
à intensidade decidida, antes do countdown. Vidas continuam config do host. Votos
limpos no `reset_game`. Smoke + **e2e socket** (maioria + empate) ✓.

---

## 2026-08-18 — Isto ou Aquilo + Buddy + Regras com duração + intensidade Caos

Três mecânicas novas (pedido do João) + 4.º nível de intensidade.

**Intensidade Caos** (💥, expose/drama entre quem está à mesa): 4.º nível a seguir
ao hardcore. Enum Prisma + Supabase, 24 prompts caos (6×4 tipos), lobby/jogo/admin.

**Isto ou Aquilo** (`isto_ou_aquilo`, fase `choice`): dilema com 2 opções; o da vez
toca numa (`choose_option`), depois `continue_round`. Conteúdo = `"A||B"` no `text`
(split no motor). 7.º tipo na roda. Admin com 2 campos (A/B) que juntam com `||`.

**Buddy** (`buddy` no prompt): quem tem o desafio escolhe (`choose_buddy`) um
jogador que "bebe junto"; mostra-se 🤝 Buddy: X e bloqueia a ação até escolher.
Sem efeito automático em vidas (overlay social).

**Regras com duração** (`duration` no prompt): aceitar um desafio com duração cria
uma **regra ativa** N jogadas (`game.activeRules`, decrementa em `advanceTurn`),
com **banner persistente** no ecrã ("🎵 Regras ativas: X — resta N"). Ex.: "até às
próximas 2 jogadas rimas ou bebes".

**Modelo:** `prompts` ganha `buddy Boolean` + `duration Int?` (db push). Formato do
conteúdo em código passa a `[texto, intensidade, { buddy?, duration? }]`; `seed.js`
e `repo.js` atualizados. Admin (`admin.{html,js}`) com checkbox buddy, input duração
e os 2 campos do isto_ou_aquilo. Seed: **155 prompts, 7 tipos** na Supabase.

**Ficheiros:** `game.js` (chooseOption/chooseBuddy, activeRules, isto_ou_aquilo,
serialização), `socket.js` (choose_option/choose_buddy), `repo.js`/`seed.js`
(buddy/duration), `content/prompts.data.js`, `schema.prisma`, `admin.{html,js}`,
`client/src/App.jsx` (emitters), `pages/Game.jsx` (ChoiceCard, BuddyBlock, banner
de regras, 7.º segmento), `pages/Lobby.jsx`.

**Verificação:** smoke do motor (isto_ou_aquilo, buddy bloqueia/define, regra
decrementa e expira a 2 jogadas) ✓ · e2e socket do isto_ou_aquilo (opções no
room_state, escolha propagada, activeRules no payload) ✓ · flags na BD (2 buddy,
4 duração, split `||`) ✓ · client build ✓.

---

## 2026-08-18 — BD ligada (Supabase/Prisma) + página de admin de conteúdo

**Integração da BD (o seam da Semana 3 concretizado):** o `repo.js` passa a ler de
Prisma/Supabase quando `DATABASE_URL` existe, com **fallback** para o conteúdo em
código se não houver BD ou se ela falhar (dev sem `.env` corre na mesma; falha de
BD não deita o jogo abaixo). `game.js`/handlers **não mudaram**.
- Ligação: pooler IPv4 da Supabase (a ligação direta `db.<ref>` é IPv6-only e não
  era alcançável). `DATABASE_URL` = transaction pooler (6543, `pgbouncer=true`);
  `DIRECT_URL` = session pooler (5432). Password com `&` → `%26`.
- `prisma db push` criou as tabelas; `prisma db seed` semeou **112 prompts** (28×4
  tipos, incl. hardcore). `dotenv` adicionado (o app carrega `server/.env`; em
  produção não faz nada e usa as env vars do Railway). `.env` é gitignored.

**Página de admin** (`/admin`, protegida por `ADMIN_PASSWORD`): CRUD de desafios
para Boca Calada / Intrigas / Desafio (e restantes tipos com prompts), com escolha
de intensidade (leve/picante/hardcore). Página estática auto-contida
(`server/src/admin.html`) + API (`server/src/admin.js`) montada antes do catch-all
da SPA. Funções CRUD em `repo.js` (adminListPrompts/Create/Update/Delete).

**Deploy (Docker):** como o `@prisma/client` passou a ser usado em runtime, a
imagem corre `prisma generate` (antes saltava). `.dockerignore` deixa de excluir
`server/prisma` (o schema é preciso no build). Falta: pôr `DATABASE_URL`,
`DIRECT_URL` e `ADMIN_PASSWORD` nas *variables* do Railway.

**Verificação:** `db push` + seed OK (112 prompts); admin API — 401 sem password,
ok com; game-types e prompts vêm da BD; **create+delete gravam na Supabase** ✓.
Servidor local liga à BD (log limpo, a servir frontend + /admin).

**Segurança:** password da BD passou pelo chat → **rodar** em Settings → Database
(e atualizar `.env` + Railway). `ADMIN_PASSWORD` local está "muda-me".

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
