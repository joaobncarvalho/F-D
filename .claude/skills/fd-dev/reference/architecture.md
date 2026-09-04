# F&D — Arquitetura

## Visão de componentes

```
Telemóveis (browsers)          Backend                    Persistência
┌──────────────┐   WebSocket   ┌────────────────────┐    ┌──────────────┐
│ React client │◀────────────▶│ Express + Socket.io │    │  PostgreSQL   │
│ (comando +   │   (realtime)  │  RoomManager (mem.) │───▶│  via Prisma   │
│  ecrã)       │               │  Map<code, Room>    │    │ (conteúdo,    │
└──────────────┘               └────────────────────┘    │  histórico)   │
                                                          └──────────────┘
```

- **Estado quente** (salas ativas) vive **em memória** para latência mínima.
- **BD** guarda o que persiste: prompts/conteúdo, histórico, estatísticas,
  snapshot opcional para recuperação de crash.

## Mapa de ficheiros

```
fd/
├── server/
│   ├── db/                     # scripts SQL standalone (setup direto/Supabase)
│   │   ├── 01_schema.sql       # estrutura (idempotente); gerado do schema.prisma
│   │   └── 02_seed.sql         # game_types + 88 prompts (idempotente)
│   ├── prisma/
│   │   ├── schema.prisma       # modelos (draft para o colega refinar)
│   │   └── seed.js             # semeia prompts (usa content/prompts.data.js)
│   └── src/
│       ├── index.js            # Express + http + Socket.io bootstrap, /health, CORS
│       ├── socket.js           # handlers de eventos (contrato abaixo)
│       ├── errors.js           # AppError (módulo próprio; quebra ciclo rooms↔game)
│       ├── rooms.js            # RoomManager em memória + serializeRoom
│       ├── game.js             # motor: roda, rondas, vidas, Intrigas, Segredos, Piramide, Vasco, stats
│       ├── repo.js             # SEAM: conteúdo de prompts (memória → Prisma)
│       └── content/
│           └── prompts.data.js # dados dos prompts (fonte única: repo + seed)
├── client/
│   └── src/
│       ├── main.jsx            # bootstrap React
│       ├── App.jsx             # orquestra socket + máquina de ecrãs + reconexão
│       ├── socket.js           # cliente Socket.io (singleton, autoConnect:false)
│       ├── sfx.js              # efeitos sonoros sintetizados (Web Audio) + mute
│       ├── confetti.js         # confetti em canvas + haptic (vibração)
│       ├── index.css           # Tailwind v4 + design system (fd-card, fd-btn, fundo)
│       ├── pages/
│       │   ├── Home.jsx        # criar / juntar (aceita ?join=CÓDIGO)
│       │   ├── Lobby.jsx       # jogadores realtime + chat + QR + config host + start
│       │   └── Game.jsx        # roda + prompt + vidas + fim de jogo
│       └── components/
│           ├── Countdown.jsx   # transição 3-2-1
│           ├── QRCode.jsx      # QR do código de sala
│           └── Wheel.jsx       # roda SVG animada
└── .claude/skills/fd-dev/      # esta skill
```

A adicionar quando se implementarem as mecânicas dedicadas:
- Votação anónima (Intrigas), submissão anónima (Segredos), timer (Boca Calada).

## Modelo de dados — memória ↔ Prisma

A **forma** em memória espelha o schema para a troca ser localizada (Regra de
Ouro #3). Rascunho de schema (FD §4; o colega valida tipos/índices/constraints):

### Em memória (`rooms.js`, hoje)

```
Room   { id, code, hostPlayerId, status: 'lobby'|'playing'|'ended',
         createdAt, players: Map<playerId, Player> }
Player { id, roomId, name, lives, isHost, connected, joinedAt }
```

### Alvo Prisma / PostgreSQL

```
rooms          id(uuid pk) · code(varchar unique) · host_player_id(fk players, nullable)
               · status(enum lobby|playing|ended) · created_at · ended_at
players        id(uuid pk) · room_id(fk) · name(varchar) · lives(int, default config)
               · is_host(bool) · connected(bool) · joined_at
               · UNIQUE(room_id, name)   -- nome único NA sala, não global
chat_messages  id(uuid pk) · room_id(fk) · player_id(fk) · text · created_at
game_types     id(pk) · key(varchar: boca_calada|desafio|intrigas|segredos)
               · label · active(bool)
prompts        id(uuid pk) · game_type_id(fk) · text · intensity(enum leve|picante)
               · active(bool)
game_rounds    id(uuid pk) · room_id(fk) · game_type_id(fk) · current_player_id(fk)
               · prompt_id(fk, nullable) · status(enum pending|resolved|refused) · created_at
life_events    id(uuid pk) · room_id(fk) · player_id(fk) · round_id(fk)
               · type(enum vida_perdida|shot) · created_at   -- log p/ estatísticas
```

Índices a validar: `rooms.code`, `players(room_id, name)` (lookups frequentes).
Estratégia de limpeza: arquivar/soft-delete `rooms` com `ended_at` há X dias
(manter para estatísticas históricas).

### Camada de dados (ponto de integração, Semana 3)

Objetivo: a app nunca fala Prisma diretamente nos handlers. Introduzir um
**repositório** fino que hoje lê de memória e amanhã lê de Prisma:

- `prompts` e `game_types` → passam a vir da BD (seed do colega).
- `rooms`/`players` → continuam em memória (estado quente); opcionalmente
  persistir snapshot + `life_events`/`game_rounds` para estatísticas.
- Trocar mock por Prisma client deve tocar **uma camada**, não os handlers.

## Contrato de eventos Socket.io

> Fonte de verdade do realtime. Ao adicionar eventos, **documenta aqui primeiro**.

### Cliente → Servidor (já implementado)

| Evento | Payload | Efeito |
|---|---|---|
| `create_room` | `{ name }` | Cria sala, criador vira host. Ack `{ok, room, you}` + emite `room_joined`. |
| `join_room` | `{ code, name }` | Valida nome único na sala; junta. Ack + `room_joined`. |
| `rejoin_room` | `{ code, playerId }` | Reconexão após queda; marca `connected=true`. Ack + `room_joined`, ou `session_invalid` se a sala/jogador já não existe. |
| `vote_intensity` | `{ intensity }` | Lobby, **qualquer jogador**. Vota a intensidade (leve/picante/hardcore/caos). Contagens em `room.intensityVotes`. |
| `set_mode` | `{ mode: 'wheel'\|'board' }` | Lobby, **só host**. Escolhe o modo (roda ou tabuleiro). Em `room.mode`. |
| `board_pick_pawn` | `{ pawn }` | Tabuleiro (`pawn`). Escolhe o peão (único). Todos escolheram → `order`. |
| `board_roll` | — | Tabuleiro (`order`). Lança o dado da ordem. Todos lançaram → `playing`. |
| `board_advance` | `{ squares: 1\|2\|3 }` | Tabuleiro (`playing`). Só a vez. Bebe 2/4/6 golos e anda; resolve a casa (mini/??/Gamble); volta = vitória; 3× andar 1 → prisão. |
| `board_resolve` | `{ action:'do'\|'drink' }` ou `{ choice:0\|1 }` | Resolve a casa de **mini-jogo** (fazer o desafio/beber, ou escolher no Isto/Aquilo). |
| `board_gamble` | `{ bet: bool }` | Casa **Gamble**: apostar (50/50 avança 2 / recua 2) ou passar (fica). |
| `board_play_card` | `{ cardId, targetId }` | Joga uma **carta** na tua vez (antes de andar): Troca/Empurrão/Denúncia/Salta-vez/Escudo/Ronda/Roubo. Escudo bloqueia a próxima carta contra ti. |
| `start_game` | `{ lives }` | Só host, ≥2 ligados. A **intensidade vem da votação** (`tallyIntensity`: maioria; empate → sorteio). `initGame` → fase `prep`, emite `game_started`. |
| `add_question` | `{ targetPlayerId, text }` | Fase `prep`. Pergunta dirigida a outro (não a si) → Boca Calada. |
| `add_secret` | `{ text }` | Fase `prep`. Segredo anónimo → Segredos. |
| `begin_play` | — | Só host. Fase `prep` → `wheel`; define o 1.º jogador da vez. |
| `choose_target` | `{ accusedPlayerId }` | Intrigas (substate `choosing`). O acusador escolhe o acusado. |
| `submit_rps` | `{ move: 'pedra'\|'papel'\|'tesoura' }` | Intrigas (substate `rps`). Acusador e acusado jogam; empate repete; acusado perde → bebe. |
| `cast_guess` | `{ guessedPlayerId }` | Segredos (fase `guessing`). Adivinha o autor (o autor não pode). |
| `reveal_result` | — | Host ou quem girou força o reveal do Segredos **ou** do Jogo do Vasco (`guessing` → resultado). |
| `continue_round` | — | Host ou quem girou avança para a próxima vez após reveal (Intrigas/Segredos), fecha a Piramide no `summary` (+1 vida a quem fez beber mais) **ou** fecha o Jogo do Vasco no `result`. |
| `spin_wheel` | — | **Só o jogador da vez** (não o host), fase `wheel`. Escolhe o tipo+prompt (a vez já está definida); Boca Calada usa pergunta dirigida; Piramide dá as mãos privadas; emite `round_started`. |
| `player_action` | `{ action: 'accept'\|'refuse' }` | Só o jogador da vez. Recusa → vida/shot; emite `action_result`. Se o prompt tiver `duration`, aceitar cria uma **regra ativa** N jogadas. |
| `choose_buddy` | `{ buddyId }` | Prompt com `buddy`. Só o jogador da vez escolhe quem "bebe junto"; mostra-se 🤝 Buddy: X (bloqueia a ação até escolher). |
| `choose_option` | `{ index: 0\|1 }` | Isto ou Aquilo (fase `choice`). Só o jogador da vez escolhe uma das 2 opções; depois `continue_round`. |
| `piramide_ready` | — | Piramide (`memorize`). Marca-se pronto; todos os ligados prontos → começa a virar. |
| `piramide_flip` | — | Piramide (`flipping`). **Só o flipper da vez** vira a carta seguinte. |
| `piramide_assign` | `{ targetId }` | Piramide (`flipping`, carta virada). Flipper faz outro beber (afirma ter o número). |
| `piramide_pass` | — | Piramide (`flipping`, carta virada). Flipper passa (ninguém bebe) → carta seguinte. |
| `piramide_respond` | `{ decision: 'aceitar'\|'desconfiar' }` | Piramide (`challenge`). **Só o alvo**. Aceita (bebe golos) ou desconfia (revela veredicto; erra → bebe o dobro). |
| `piramide_next` | — | Piramide (`resolved`). Flipper ou host avança para a carta seguinte. |
| `vasco_start_clues` | — | Jogo do Vasco (`reveal`). Host ou quem girou arranca a ronda de pistas. |
| `vasco_clue_done` | — | Vasco (`clues`). Quem está à vez (ou host/quem girou) marca que já deu a pista. |
| `vasco_vote` | `{ suspectId }` | Vasco (`voting`). **Todos votam** quem acham que é o Vasco (não em si). Todos votaram → apura (host não arbitra). |
| `vasco_redeem` | `{ word }` | Vasco (`redemption`). Só o **Vasco apanhado** escolhe a palavra do quadro (redenção): acerta → +1 vida; falha → 5 golos. |
| `skip_turn` | — | Só host, fase `prompt`. Salta a vez sem penalização. |
| `end_game` | — | Só host. Calcula stats, emite `game_over`. |
| `reset_game` | — | Só host. Volta ao lobby (`game=null`), emite `back_to_lobby`. |
| `send_message` | `{ text }` | Chat de grupo; re-emitido a toda a sala como `chat_message`. |
| (disconnect) | — | Marca `connected=false`, reatribui host, remove sala se vazia. |

### Servidor → Cliente (já implementado)

| Evento | Payload | Quando |
|---|---|---|
| `room_joined` | `{ room, you }` | Após criar OU juntar (confirmação individual). |
| `room_state` | `{ room }` | Broadcast a toda a sala em qualquer mudança de estado. |
| `chat_message` | `{ playerId, name, text, at }` | Nova mensagem. |
| `game_started` | `{ intensityResult }` | `intensityResult = { intensity, randomized, candidates, counts }`. Cliente mostra a roleta da intensidade (`IntensityReveal`) → countdown. |
| `you_are_author` | `{ roundId }` | **PRIVADO** (só ao autor do segredo, via sala por playerId). |
| `piramide_hand` | `{ roundId, cards: [{rank,suit}×3] }` | **PRIVADO** (Piramide). A mão de cada jogador, só a ele. **Nunca** em broadcast; reenviada no `rejoin_room`. |
| `vasco_role` | `{ roundId, isImpostor, word }` | **PRIVADO** (Vasco). Papel de cada jogador: grupo recebe a `word`; o Vasco recebe `word:null`. **Nunca** em broadcast; reenviado no `rejoin_room`. |
| `intrigas_reason` | `{ roundId, reason }` | **PRIVADO**. Intrigas: a pergunta secreta. Vai ao acusador (spin), aos espectadores (ao escolher) e ao acusado só se ganhar o RPS. |
| `round_started` | `{ gameTypeKey }` | Só o tipo (para animar a roda); resto vem no room_state. |
| `round_started` | `{ round }` | Nova ronda; cliente anima a roda até `round.gameTypeKey` e revela o prompt. |
| `action_result` | `{ effect }` | Feedback da ação (`accepted`/`vida_perdida`/`vida_extra`/`eliminated`) para o flash. `eliminated` = ficou sem vidas (→ ecrã de telemóvel partido). |
| `game_over` | `{ stats }` | Fim de jogo; ecrã de estatísticas. |
| `back_to_lobby` | `{}` | Host reiniciou; clientes voltam ao lobby. |
| `session_invalid` | `{ message }` | Reconexão falhou (terminal); cliente limpa a sessão e volta ao Home. |
| `error_msg` | `{ message }` | Erro legível (nome duplicado, sala inexistente, jogo já começou). |

> `room_state.game` transporta `{ phase, intensity, startingLives, roundCount,
> round, currentPlayerId, finalStats, questionCount, questionsByTarget }` — é a
> fonte de verdade que o cliente usa para renderizar o jogo. `phase` ∈
> `prep | wheel | prompt | intrigas | guessing | piramide | vasco | gameover`
> (Intrigas com `round.substate` = `choosing | rps | reveal`). O **texto** das
> perguntas nunca vai no `room_state` (só contagens); só aparece no `round.prompt`
> quando calha, no Boca Calada. Os eventos acima são gatilhos de animação/feedback.
> **Piramide** (`phase='piramide'`): `round.substate` ∈ `memorize | flipping |
> challenge | resolved | summary`; `round.currentPlayerId` é o **flipper** da vez
> (não o spinner). O `round` leva a pirâmide (só rank/naipe das cartas **já
> viradas**), a carta virada, a atribuição e o veredicto — mas **nunca as mãos**
> (essas só via `piramide_hand` privado). Match por número; golos por nível 2→10.
> **Vasco** (`phase='vasco'`): `round.substate` ∈ `reveal | clues | voting |
> redemption | result`. Público: só o **tema** (`theme`); as 9 palavras não vão em
> clues. O grupo recebe a palavra por `vasco_role` privado (Vasco recebe
> `word:null`). Identidade escondida até ao `result`. Fluxo: papéis → pistas à vez
> → **votação** (todos votam quem é o Vasco, `vasco_vote`; o host **não** arbitra)
> → se o mais votado for Vasco, **redenção** (`vasco_redeem`: escolhe a palavra do
> quadro; `boardWords` só aqui) → `result`. Apanhado+acerta ou escapa → +1 vida;
> apanhado+falha → 5 golos.
> **Conteúdo dos prompts:** `repo.js` (async, seam de integração) → hoje lê de
> `content/prompts.data.js`; trocar por Prisma sem mudar `game.js`/handlers.

`room` serializado por `serializeRoom()`: `{ id, code, status, hostPlayerId,
createdAt, intensityVotes, players: [{ id, name, lives, isHost, connected,
eliminated }] }` (players ordenados por `joinedAt`).

### Camadas "hardcore" (2026-09-03)

> ⚠️ As secções acima descrevem o núcleo e não foram todas reescritas: contagens
> de tipos e de prompts nelas estão desatualizadas. Esta secção está em dia.

Três camadas transversais e um modo, todos por cima do MESMO motor da Roda. A
regra de desenho que os une, e que tem testes dedicados: **nada disto manda beber
mais** — mexe em vidas, em vez, em exposição e em risco de saída.

**Modificadores** (`game/modificadores.js`) — seis interruptores de REGRAS,
ortogonais à intensidade (essa só mexe no conteúdo). Desde **2026-09-04 não se
escolhem: sorteiam-se** (ver o progress-log desse dia). O host só **veta**
(`set_vetados` → `room.vetados`, que nasce com `['sem_anonimato']`); o sorteio de
arranque acontece no `initGame` (`{ sorteio: true, vetados }`) ponderado pela
intensidade votada (`PLANO`), e mais regras caem entre rondas (`horaDeSorteio` /
`sorteiaAMeio`, gancho no `nextRound`, ao lado do Evento da Noite e nunca na mesma
ronda que ele). Algumas saem com prazo (`game.modifiersTemp`, key → rondas), que
`passaRonda` consome; o que expira entra em `game.modifiersFora` e não volta.
Chegam a todos em `room.modifiers = { catalogo, vetados, ativos, prazos }` e em
`game.modifiers`; a carta a encenar vai em `game.ultimoModificador`. Pontos de
leitura:
`custoRecusa` e `morteSubita` no `resolveAction`, `podeDobrar` na serialização,
`revelaRazao` no handler do `submit_rps`. O **Alvo Marcado** é registado dentro do
`helpers.perdeVida` (e não no `resolveAction`) porque há cinco caminhos que tiram
vidas; o travão de repetições vive lá com ele.

**A Conta** (`game/divida.js`, modificador `divida`) — `game.dividas` (playerId →
goles) mais `game.heranca`. Ações: `player_action:'adiar'`, `divida_transfere`,
`heranca_escolhe`. **Fecha** no `buildStats` e no evento do Cobrador; sem esses
dois pontos, adiar seria uma forma gratuita de nunca beber.

**Tipos novos** — a roda tem **24** tipos. Os seis de 2026-09-03 e o que cada um
esconde do broadcast (é sempre aí que está o risco):

| fase | módulo | privado (server-side) | substates |
|---|---|---|---|
| `bomba` | `game/bomba.js` | `pavioMs`, `acesaEm` | `a_arder → rebentou` |
| `leilao` | `game/leilao.js` | `licitacoes` (só `jaLicitaram`) | `licitar → result` |
| `sincronia` | `game/sincronia.js` | `respostas` (só `jaResponderam`) | `responder → result` |
| `detetor` | `game/detetor.js` | `verdade`, `votos` | `responder → votar → result` |
| `julgamento` | `game/julgamento.js` | votos (via `veredito.js`) | `defesa → votar → result` |
| `contrato` | `game/contrato.js` | assinaturas (só `jaAssinaram`) | `escolher → assinar → result` |

O Julgamento reutiliza o `veredito.js` (agora com `rotulos` configuráveis) e o
Contrato as `activeRules` — não há sistemas paralelos de votação nem de regras.

**Modo da Morte** (`game/morte.js`, `room.mode = 'morte'`) — **camada, não motor**.
Corre o `game.js` inteiro; só muda a resolução. Estado em `game.morte`. Três
regras: recusar elimina (no `resolveAction`), quem sai vira fantasma com mão
privada + testamento (em `morte.varre`, chamado do `fecharRonda` — um só sítio,
porque há uma dúzia de caminhos que eliminam alguém), e o relógio da ronda
encurta (o `autoresolve.timeoutFor` lê `morte.segundosRonda`). Eventos:
`fantasma_carta`, `testamento`; canal privado `fantasma_mao` (o broadcast leva só
**quantas** cartas cada fantasma tem, nunca quais). Restando dois, o `spinWheel`
força o `duelo`; restando um, o `fecharRonda` termina a noite.

**Eliminação:** ao ficar com 0 vidas (recusa fatal em Boca Calada/Desafio) o
jogador fica `eliminated` — sai da rotação e das votações (`connectedOrder` só
conta ativos) e o cliente mostra um **overlay de telemóvel partido**
(`BrokenScreen`), continuando a ver. Quando resta **≤1 jogador ativo**, o
`resolveAction` termina o jogo (último de pé = `finalStats.survivor`) e emite
`game_over`.

### ⚖️ Tribunal da Injustiça (2026-09-04)

Tipo novo, em **dois sítios** que partilham a votação e o conteúdo mas não o
motor — a roda tem `round`, o tabuleiro não:

- **Roda** (`game/tribunal.js`, fase `tribunal`): sai só em hardcore/caos. É o
  primeiro tipo com `intensidades` no `TYPE_PROFILE` — o `pickWeightedType`
  passou a receber a intensidade em vigor para poder filtrar. Substates
  `defesa → votar → result`; condenado perde uma vida, absolvido faz beber quem
  o condenou (a economia do Julgamento, para condenar não ser grátis).
- **Tabuleiro** (`board/tribunal.js`): o `applyPrison` deixa de ser uma sentença
  e passa a ser uma acusação — 80% abre julgamento, 20% condena logo. A pena sai
  do banco `prisao` NO MOMENTO DA ACUSAÇÃO e fica guardada em `b.tribunal.pena`,
  fora do payload: se o júri soubesse o que ele arrisca, votava por pena e não
  por defesa. Vive em `b.tribunal` e **não** em `b.pending` porque três sítios
  fazem `pending = null` logo a seguir a mandar alguém preso. Tranca a mesa toda
  (`advance`/`playCard` recusam) e **não mexe na ordem das vezes**.
- **Votação:** o `game/veredito.js` de sempre. Ganhou um parâmetro `holder`
  opcional (`vota`/`completo`/`fecha`) para o tabuleiro poder apontar para o seu
  objeto — continua a haver um único sistema de votação e uma única regra de
  empate (que absolve).
- **Conteúdo:** tipo `tribunal` em `prompts.data.js` + BD, editável na /admin. O
  tabuleiro enche um saco de teses no `initBoard` (o `applyPrison` é síncrono e
  tem seis chamadores — um `await` lá dentro contaminava meio motor).
- **Desliga-se com `TRIBUNAL=0`**, como o `EVENTOS`/`SNAPSHOT`. Os testes do
  tabuleiro que contam com prisão imediata usam-no.

### Telemetria e /admin (2026-09-04)

**`telemetria.js`** — contadores AGREGADOS do que a mesa faz com o conteúdo. É o
que alimenta o separador 📊 da `/admin`, que até aqui deixava escrever prompts
sem nunca dizer se prestavam. Nota importante para quem vier a este ficheiro à
procura de histórico: as tabelas `Room`/`Player`/`GameRound`/`LifeEvent` do
schema **continuam sem ninguém a escrever nelas** — a telemetria não as usa.

- **Nunca guarda pessoas.** Sem nomes, ids, códigos de sala ou texto escrito pela
  mesa. Os três tipos que põem texto da mesa em `round.prompt` (Boca Calada com
  pergunta da preparação, Quem Disse, Segredos) marcam-no na origem com
  `round.promptDaMesa`, e o `textoNosso()` para aí: conta-se o TIPO, nunca o
  texto. Há um teste que procura os nomes no payload inteiro.
- **Escrita:** `rondaAbriu` (no fim do `spinWheel`), `rondaFechou` (no
  `resolveAction` e no `skipTurn`), `regra`/`vetos` (em `modificadores.js`),
  `noiteAcabou` (no `buildStats` com `outcome:'fim'`, e no cleanup do `rooms.js`
  com `'abandonada'`; `game.noiteContada` trava a repetição).
- **Estado:** `scope → key → { metrics, label }`, com `metrics` em JSON de
  propósito — medir uma coisa nova não pede migração nenhuma.
- **Persistência:** ficheiro `.data/telemetria.json` (fonte de verdade em runtime)
  + `telemetry_counters`/`telemetry_nights` (`db/04_telemetria.sql`), como o
  `snapshot.js`. Sem as tabelas, `temTabelas()` deteta e degrada em silêncio.
  Arranca no `restoreRooms` do `socket.js`. Desliga-se com `TELEMETRIA=0`.
- **API:** `GET /admin/api/stats` (resumo já calculado — as regras de leitura
  vivem no módulo, onde há testes), `GET /admin/api/stats/conteudo` (cruza os
  prompts todos com as contagens, e por isso inclui os que NUNCA saíram),
  `POST /admin/api/stats/{reset,flush}`.

### A adicionar (Semana 3 — motor de jogo) — proposta

> `start_game` e `game_started` já implementados (ver tabelas acima). Falta o
> conteúdo real da ronda a seguir ao countdown.

| Evento | Direção | Payload | Notas |
|---|---|---|---|
| `spin_wheel` | C→S | — | Só host (ou automático); servidor decide resultado. |
| `wheel_result` | S→C | `{ gameTypeKey }` | Cliente anima a roda a parar aqui (servidor é autoridade). |
| `round_started` | S→C | `{ round: {id, gameTypeKey, currentPlayerId, prompt} }` | Prompt anonimizado onde aplicável. |
| `player_action` | C→S | `{ roundId, action: 'accept'|'refuse' }` | Só o jogador da vez. |
| `life_update` | S→C | `{ playerId, lives, event: 'vida_perdida'|'shot' }` | Anima contadores. |
| `submit_secret` | C→S | `{ text }` | Segredos: **nunca** reenviar autor no payload. |
| `submit_vote` | C→S | `{ roundId, targetPlayerId }` | Intrigas: votação anónima. |
| `game_over` | S→C | `{ stats }` | Ecrã final ("quem bebeu mais"). |

**Regras do contrato:** o servidor decide resultados (roda, vez, vidas); o
cliente **anima o resultado**, não o gera. Segredos/votos são anonimizados no
servidor antes de qualquer broadcast.

## Smoke test da lógica de salas (sem rede)

```bash
cd fd/server && node --input-type=module -e "
import { RoomManager, serializeRoom, AppError } from './src/rooms.js';
const rm = new RoomManager();
const { room, player } = rm.createRoom('Joao');
console.log('code', room.code, 'host', player.isHost, 'lives', player.lives);
rm.joinRoom(room.code, 'Maria');
try { rm.joinRoom(room.code, 'joao'); } catch(e){ console.log('dup:', e.message); }
const d = rm.handleDisconnect(room.code, player.id);
console.log('novo host:', serializeRoom(d.room).players.find(p=>p.isHost)?.name);
"
```
