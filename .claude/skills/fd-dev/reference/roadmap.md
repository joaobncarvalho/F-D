# F&D — Roadmap (LIVING)

> Marca `[x]` quando um item estiver **feito e verificado**. Mantém alinhado com
> `progress-log.md`. Deadline MVP: **11 setembro 2026**.

Legenda: ✅ feito · 🚧 em curso · ⬜ por fazer · 🔗 ponto de integração com a BD

---

## Semana 1 (16–23 ago) — Fundações + sala em memória

**João (app/realtime)**
- [x] Setup repo (git) + monorepo `server/` + `client/`
- [x] Skeleton frontend (Vite + React + Tailwind v4 + Framer Motion)
- [x] Skeleton backend (Express + Socket.io)
- [x] `RoomManager` em memória: criar sala (código 4 chars, sem chars ambíguos)
- [x] Juntar por código + validação de nome único **dentro da sala**
- [x] Ligação WebSocket básica + broadcast de `room_state`
- [x] Lobby: lista de jogadores em tempo real
- [x] Chat de grupo (base)
- [x] Botão "Start" visível só ao host, ativo com ≥2 jogadores (UI; ação na S3)
- [x] Reatribuição automática de host quando o host se desliga

**Colega (BD)**
- [ ] Escolher provedor Postgres (Supabase / Neon / Railway) e criar instância
- [ ] Partilhar acesso (connection strings) — ver `db-setup.md`
- [ ] Desenhar `schema.prisma` a partir do rascunho (ver `architecture.md`)

---

## Semana 2 (24–31 ago) — Lobby polido + animações-chave

**João**
- [x] Polir lobby (estado offline por jogador, banner "a religar…", empty states)
- [x] Animação de transição "vamos começar" (countdown 3-2-1) — `Countdown.jsx`
- [x] Animações-chave em Framer Motion: entrada/saída de jogadores, chat
- [x] Código de sala partilhável: copiar + **QR code** (`QRCode.jsx`, entrada `?join=`)
- [x] Aviso de responsabilidade no ecrã inicial ("joguem com moderação")
- [x] Reconexão automática testada (drop → `rejoin_room` → recupera estado; e2e ✅)
- [x] Botão "Start" funcional → `start_game` → `game_started` → countdown → jogo

**Colega (BD)** — scaffold preparado pelo João (draft para o colega refinar)
- [x] `schema.prisma` escrito (draft, validado; `prisma generate` OK) 🔗
- [x] Seed script escrito (~22 prompts × 4 tipos, idempotente) — `prisma/seed.js`
- [ ] Criar instância Supabase + connection strings (falta credenciais)
- [ ] Correr migrations (`prisma migrate dev`) — precisa das strings
- [ ] Correr seed (`prisma db seed`) — precisa das strings
- [ ] Rever índices e constraints (colega valida o draft)

---

## Semana 3 (1–7 set) — Motor de jogo + integração BD

**João**
- [x] Roda principal ("Main Event"): SVG animado + seleção do tipo (`Wheel.jsx`)
- [x] Lógica de rondas: rotação **sequencial** (servidor é autoridade) — `game.js`
- [x] **Quem gira a roda é o jogador da vez** (não o host) — pedido do João
- [x] **Fase de perguntas** no início: jogadores escrevem perguntas dirigidas a outros
- [x] **Boca Calada** com mecânica dedicada: pergunta embaraçosa dirigida → "🤐 Boca
      Calada" (bebe) ou "🎤 responder" (passa a vez)
- [x] Mostrar prompt da ronda (por tipo de jogo, com intensidade)
- [x] Sistema de vidas: recusa → -1 vida + bebe; 0 vidas → shot
- [x] Contadores de vida animados + flash de feedback (aceito / -1 vida / shot)
- [x] Config do host no lobby: vidas 1–5 + intensidade leve/picante
- [x] Ecrã de fim de jogo com stats + "jogar outra vez"; controlos host (saltar/terminar)
- [x] 🔗 **Seam de integração pronto** (`repo.js` async, mesma interface do Prisma;
      dados em `content/prompts.data.js` partilhados com o `seed.js`)
- [x] **Intrigas** (v2, pedido do João): pergunta secreta ao acusador → escolhe
      alguém (que não sabe a razão) → pedra-papel-tesoura → acusado perde bebe e
      nunca sabe; ganha e fica a saber. Razão entregue em privado.
- [x] **Segredos**: submissão anónima na prep + grupo adivinha o autor (aviso
      privado `you_are_author`, autor escondido no payload até ao reveal)
- [x] **Piramide (Desconfia)** (pedido do João): 5.º tipo na roda — cartas digitais
      privadas (memorizar), pirâmide 15 cartas (golos 2→10), virar+atribuir+desconfiar
      (dobro), prémio +1 vida a quem fez beber mais. Mãos nunca no broadcast
      (`piramide_hand` privado). E2E socket ✓. Peso na roda ~10% (fração-alvo fixa).
- [x] **Jogo do Vasco (Impostor)** (pedido do João): 6.º tipo na roda — quadro de 9
      palavras, o grupo sabe a palavra secreta, o(s) Vasco(s) não e adivinham pelas
      pistas. Acerta → +1 vida; falha → 5 golos. Papel privado (`vasco_role`); palavra
      e identidade nunca no broadcast. E2E socket ✓
- [x] **Redesign completo** (tema de festa): fundo animado, cartas glass, botões
      gradiente, fonte display, roda com halo
- [x] **Som** (Web Audio sintetizado + mute), **confetti** (canvas) e **vibração**
- [x] 🔗 **Troca final mock→Prisma** feita: `repo.js` lê da Supabase (pooler IPv4)
      com fallback para memória. DB push + seed (112 prompts). `dotenv` + `.env`.
- [x] **Página de admin** (`/admin`, `ADMIN_PASSWORD`): CRUD de desafios por tipo +
      intensidade (leve/picante/hardcore). `server/src/admin.{html,js}` + repo CRUD.

**Colega (BD)**
- [ ] Finalizar schema definitivo, disponibilizar Prisma client estável
- [ ] Queries de estatísticas finais ("quem bebeu mais")

---

## Semana 4 (8–11 set) — Polimento + playtest + deploy

**João**
- [ ] Polimento de animações e transições
- [ ] Ecrã de fim de jogo: estatísticas ("quem bebeu mais", "quem recusou mais")
- [ ] Controlos do host: saltar jogador, remover quem saiu, terminar jogo
- [ ] Playtest real com amigos → correção de bugs
- [ ] Deploy: backend (Railway/Render/Fly — WebSockets persistentes) + frontend (Vercel/Netlify)

**Colega (BD)**
- [ ] Troubleshooting de queries/performance durante os testes
- [ ] Validar estratégia de limpeza/arquivo de salas antigas

---

## Decisões pendentes (§8 do FD)

1. ✅ **DECIDIDO (default):** Vidas = **3 por defeito, configurável pelo host (1–5)**
   no lobby. Implementado. (Reabrir se a equipa quiser outro valor.)
2. ✅ **DECIDIDO (default):** Vez **sequencial** (rotação). Implementado em `game.js`.
   Fácil trocar para aleatória (isolado em `spinWheel`). (Reabrir se necessário.)
3. **Prompts do host** — o host pode editar/adicionar, ou só conteúdo fixo no MVP?
   → afeta schema (`prompts.room_id`?) e UI.
4. **Persistência entre sessões** — guardar o mesmo grupo para outro dia, ou
   cada sala do zero? → afeta modelo de `players`/`rooms`.
5. **Boca Calada** — confirmar mecânica exata com o João; precisa de timer visível.
