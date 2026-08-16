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
- [x] **Intrigas**: votação anónima ("quem é mais capaz…"); mais votado bebe
- [x] **Segredos**: submissão anónima na prep + grupo adivinha o autor (aviso
      privado `you_are_author`, autor escondido no payload até ao reveal)
- [x] **Redesign completo** (tema de festa): fundo animado, cartas glass, botões
      gradiente, fonte display, roda com halo
- [x] **Som** (Web Audio sintetizado + mute), **confetti** (canvas) e **vibração**
- [ ] 🔗 Troca final mock→Prisma (só quando a BD tiver strings; muda só `repo.js`)

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
