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
- [x] **Isto ou Aquilo** (7.º tipo na roda): dilema 2 opções (`A||B`), o da vez escolhe.
- [x] **Buddy** (flag no prompt): quem tem o desafio escolhe alguém que "bebe junto" 🤝.
- [x] **Regras com duração**: aceitar → regra ativa N jogadas + banner persistente.
- [x] **Intensidade Caos** (💥 expose) + admin com buddy/duração/opções.
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
- [x] Schema aplicado e estável na Supabase (2026-09-01c) — inclui `prompts.tag`
      (packs) e `room_snapshots` (recuperação de salas)
- [ ] Rever índices/limpeza de `room_snapshots` (hoje: TTL de 6h no código)
- [ ] Queries de estatísticas finais ("quem bebeu mais")

---

## Semana 4 (8–11 set) — Polimento + playtest + deploy

**João**
- [x] Polimento de animações e transições (roda feito; **tabuleiro**: ecrã de fim
      animado — coroa do vencedor, prémios em stagger, classificação a entrar)
- [x] Ecrã de fim de jogo: estatísticas — **Roda** (pódio "bebeu mais/recusou mais");
      **Tabuleiro** agora com "prémios" (🍺 Rei da Golada, 🚔 Preso Habitual, 🎴
      Maquiavélico) + classificação final animada. Contadores `prisonCount`/`cardsPlayed`.
- [x] Controlos do host: saltar jogador, remover quem saiu, terminar jogo (roda já
      tinha `skip_turn`/`end_game`; **tabuleiro** agora tem `board_skip`/`board_end`/
      `board_kick` + auto-skip de quem se desliga — anti-deadlock)
- [x] **Pacote pré-playtest (2026-09-01)** — ver progress-log:
      · anti-repetição de prompts (saco por sala) · wake lock · PWA (manifest+SW+ícones)
      · snapshot/recuperação das salas depois de reinício
      · 7 tipos novos (Eu Nunca · Mais Provável · Termómetro · Quem Disse · Cascata ·
        Desenha · Reação) — Roda, e a Reação também no Torneio e no Tabuleiro
      · curva de intensidade · packs temáticos · identidade transversal (emoji+cor)
      · feed de eventos · pausa do host (com cronómetros congelados) · auto-resolve
      · modo TV (`/?tv=CODIGO`) · legibilidade de bar · música com ducking
      · cartão de resultados partilhável · ecrã de regras · voltar a jogar
- [x] **1.º playtest feito** → correções e melhorias (2026-09-01d):
      · 🐛 Beer Pinga: dois jogadores seguidos na casa — o 2.º não atirava (corrigido
        no servidor E no cliente, com teste de regressão)
      · 🐌 Beer Pinga: medidor por relógio e 4× mais lento (andava ao dobro a 120 Hz)
      · 🪙 Cara ou Coroa lançado NA APP, com moeda 3D — também no Torneio e no showroom
      · 🏆 Torneio: apostas dos espetadores (ninguém fica parado) + final à melhor
        de 3 + 5.º tipo de duelo
      · 🎲 Casa ??: 9 → 24 efeitos com pesos (18 tipos), fim da repetição
- [x] **Revisão pré-playtest (2026-09-02)** — ver progress-log:
      · 🔴 identidade por `token` no rejoin (dava para assumir a identidade de
        outro jogador, e com ela as mãos/papéis privados e o host)
      · 🔴 lotação da sala (`MAX_PLAYERS`, 12) — entravam 41 sem recusa
      · 🟠 roda com `min` de jogadores por tipo + pesos por duração + anti-repetição
      · 🟠 +227 prompts: nenhum nível abaixo de 12 por tipo (360 → 587)
      · 🟠 entrar com o jogo a decorrer (Roda e Tabuleiro)
      · 🟡 salas órfãs · sala sem host · ritmo do `draw_stroke` · bundle em 4 pedaços
      · 72 testes (eram 58), `test/hardening.test.js` novo
- [x] **Step up visual (2026-09-02b)** — ver progress-log:
      · 🌡️ humor da noite: a app inteira muda com a intensidade (fundo, velocidade,
        vinheta, halo das cartas); abanão de ecrã só do Hardcore para cima
      · 🎡 roda com recuo, cauda longa, tiques por fatia e aterragem (fatia
        vencedora acende, as outras apagam)
      · 💥 batidas de ecrã inteiro (tinta → ícone com gesto → palavra) a substituir
        o FlashOverlay
      · 🎬 `motion.js`: molas e durações partilhadas (adotado no caminho da Roda;
        tabela de conversão para os ~20 sítios do Tabuleiro/Torneio)
      · 🐛 a "Curva de intensidade" do lobby não chegava ao motor — corrigido
      · ✨ palco do Ambiente no showroom (`?demo=1`) para ver humores e batidas
      · verificado no browser a sério (roda alinhada com o servidor, 50 rondas sem erros)
- [ ] 2.º playtest (11 set) → validar estas mudanças com o grupo
- [x] **Snapshot das salas na Postgres** (2026-09-01b) — modelo `RoomSnapshot`;
      ficheiro a cada 5s + BD a cada 15s e no SIGTERM. Sobrevive a um deploy que
      troque de máquina, que era o buraco que restava.
- [x] **SQL da pasta `db/` regenerado** (2026-09-01b) — `db/generate.mjs` gera
      `01_schema.sql` (cria OU atualiza) e `02_seed.sql` (18 tipos, 360 prompts)
      das fontes de verdade. `npm run db:sql` · `npm run db:sync`.
- [x] 🔗 **Supabase em dia** (2026-09-01c) — `db push` (diff conferido antes:
      só aditivo) + seed. 18 tipos · 361 prompts · packs · `room_snapshots`.
      Cadeia verificada a jogar contra a BD e a recuperar uma sala com o disco
      local apagado (`origem: "bd"`).
- [x] Deploy no ar (Railway, imagem única) — inclui **ambos os modos**. Falta só o
      `db push`+seed da tabela `board_items` na Supabase p/ ativar a edição na admin.
- [x] **Bancos do tabuleiro em dados/BD** (melhoria): ?? / prisão / cartas passam a
      `board_items` (Prisma) + CRUD na /admin (separador 🎲 Tabuleiro), com fallback
      em código (`content/board.data.js`). Efeitos do ?? passam a **tipados**.
- [x] **Cartas privadas** (melhoria): a mão só chega a cada dono (`board_hand`); o
      broadcast leva só a contagem (🎴×N). Deixaram de ser públicas.

**Colega (BD)**
- [ ] Troubleshooting de queries/performance durante os testes
- [ ] Validar estratégia de limpeza/arquivo de salas antigas

---

## Decisões pendentes (§8 do FD)

1. ✅ **DECIDIDO (default):** Vidas = **3 por defeito, configurável pelo host (1–5)**
   no lobby. Implementado. (Reabrir se a equipa quiser outro valor.)
2. ✅ **DECIDIDO (default):** Vez **sequencial** (rotação). Implementado em `game.js`.
   Fácil trocar para aleatória (isolado em `spinWheel`). (Reabrir se necessário.)
3. ✅ **DECIDIDO (2026-08-21):** Conteúdo **fixo** no MVP — só editável na `/admin`
   (CRUD já existe). Sem prompts por sala; schema fica simples. (Reabrir pós-MVP.)
4. ✅ **DECIDIDO (2026-08-21):** **Cada sala do zero** (efémero, estilo Jackbox).
   Sem perfis persistentes/login. Menos PII, mais simples. (Reabrir pós-MVP.)
5. ✅ **DECIDIDO/FEITO (2026-08-21):** Boca Calada tem **timer visível** de 20s
   (`components/Timer.jsx`) — pressão social/visual; não força ação (servidor
   continua autoridade).
