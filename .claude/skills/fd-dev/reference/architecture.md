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
│   ├── prisma/
│   │   ├── schema.prisma       # modelos (draft para o colega refinar)
│   │   └── seed.js             # semeia prompts (usa content/prompts.data.js)
│   └── src/
│       ├── index.js            # Express + http + Socket.io bootstrap, /health, CORS
│       ├── socket.js           # handlers de eventos (contrato abaixo)
│       ├── errors.js           # AppError (módulo próprio; quebra ciclo rooms↔game)
│       ├── rooms.js            # RoomManager em memória + serializeRoom
│       ├── game.js             # motor: roda, rondas, vidas, Intrigas, Segredos, stats
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
| `start_game` | `{ lives, intensity }` | Só host, ≥2 ligados. Aplica config, `initGame` → fase `questions`, emite `game_started`. |
| `add_question` | `{ targetPlayerId, text }` | Fase `prep`. Pergunta dirigida a outro (não a si) → Boca Calada. |
| `add_secret` | `{ text }` | Fase `prep`. Segredo anónimo → Segredos. |
| `begin_play` | — | Só host. Fase `prep` → `wheel`; define o 1.º jogador da vez. |
| `cast_vote` | `{ targetPlayerId }` | Intrigas (fase `voting`). Voto anónimo; auto-revela quando todos votam. |
| `cast_guess` | `{ guessedPlayerId }` | Segredos (fase `guessing`). Adivinha o autor (o autor não pode). |
| `reveal_result` | — | Host ou quem girou força o reveal de Intrigas/Segredos. |
| `continue_round` | — | Host ou quem girou avança para a próxima vez após reveal. |
| `spin_wheel` | — | **Só o jogador da vez** (não o host), fase `wheel`. Escolhe o tipo+prompt (a vez já está definida); Boca Calada usa pergunta dirigida; emite `round_started`. |
| `player_action` | `{ action: 'accept'\|'refuse' }` | Só o jogador da vez. Recusa → vida/shot; emite `action_result`. |
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
| `game_started` | `{}` | Dispara a transição de countdown no cliente. |
| `you_are_author` | `{ roundId }` | **PRIVADO** (só ao autor do segredo, via sala por playerId). |
| `round_started` | `{ gameTypeKey }` | Só o tipo (para animar a roda); resto vem no room_state. |
| `round_started` | `{ round }` | Nova ronda; cliente anima a roda até `round.gameTypeKey` e revela o prompt. |
| `action_result` | `{ effect }` | Feedback da ação (`accepted`/`vida_perdida`/`shot`) para o flash. |
| `game_over` | `{ stats }` | Fim de jogo; ecrã de estatísticas. |
| `back_to_lobby` | `{}` | Host reiniciou; clientes voltam ao lobby. |
| `session_invalid` | `{ message }` | Reconexão falhou (terminal); cliente limpa a sessão e volta ao Home. |
| `error_msg` | `{ message }` | Erro legível (nome duplicado, sala inexistente, jogo já começou). |

> `room_state.game` transporta `{ phase, intensity, startingLives, roundCount,
> round, currentPlayerId, finalStats, questionCount, questionsByTarget }` — é a
> fonte de verdade que o cliente usa para renderizar o jogo. `phase` ∈
> `prep | wheel | prompt | voting | guessing | gameover`. O **texto** das perguntas nunca vai no
> `room_state` (só contagens); só aparece no `round.prompt` quando calha, no Boca
> Calada. Os eventos acima são gatilhos de animação/feedback pontuais.
> **Conteúdo dos prompts:** `repo.js` (async, seam de integração) → hoje lê de
> `content/prompts.data.js`; trocar por Prisma sem mudar `game.js`/handlers.

`room` serializado por `serializeRoom()`: `{ id, code, status, hostPlayerId,
createdAt, players: [{ id, name, lives, isHost, connected }] }` (players ordenados
por `joinedAt`).

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
