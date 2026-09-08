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
- [x] **Movimento nas cartas mais jogadas + guardas nas outras costuras (2026-09-08c)**
      — pedido do João ("upgrade geral antes do grande playtest"). A recolha
      mostrou que o upgrade pedido estava quase todo feito (`motion.js` já em 38
      de ~45 ficheiros); o que faltava estava noutro sítio:
      · 🎬 `cards.jsx` (`PromptCard`/`ChoiceCard`/`IntrigasCard`) não tinha um
        único `<motion.*>` — é o cartão que a mesa vê MAIS vezes. Nas Intrigas os
        três passos trocavam sem gesto nenhum (o `CardShell` não remonta dentro
        do mesmo tipo). Peças novas em `shared.jsx`: `CardShell passo={…}` e
        `Fichas` (a fila de escolher jogador, escalonada). Também no
        `GuessingCard` e `VascoCard`. Tudo com `suavizado()`.
      · 🛡️ o guarda anti-ecrã-branco (nascido do bug do Tribunal) só cobria a
        Roda. Passa a cobrir as três tabelas de despacho: `board.pending.kind` e
        `t.phase`. Não havia buraco hoje — passa a haver quem verifique amanhã.
      · 🐛 **três testes intermitentes** (nenhum novo, falhavam ~1 em 10): dois
        afirmavam o que o OUTRO jogador não recebeu, quando o tabuleiro/roda são
        sorteados e podiam dar-lho por acaso; o do Desenha girava 400 vezes à
        espera de sorte, e passa a encomendar o tipo.
      Verificado: `npm test` **226/226** em **60 corridas seguidas sem falhas**,
      build limpo, guardas exercidos com erros injetados.
      ⚠️ **Por ver com olhos:** as animações novas não foram abertas no browser
      (extensão do Chrome não ligada) — falta o showroom nas cenas de Intrigas,
      Segredos e Vasco.
- [x] **Conteúdo dos seis tipos hardcore ao nível dos outros (2026-09-08d)** —
      os tipos de 03 set nunca passaram pelo critério de "12 por nível" fixado a
      02 set: estavam a 2 no `bomba/caos`, 1 no `sincronia/caos`, **0 no
      `contrato/caos`**. Não partia nada (há fallback de intensidade), mas o
      `sincronia/caos` tinha um único prompt — era sempre o mesmo. **+194
      prompts**, os seis a 12/12/12/12. Catálogo em 905 no código e 924 na BD.
      **Fechado (2026-09-08e):** o João decidiu ficar com os **48 temas do
      Tribunal todos ativos** (os 18 escritos na /admin + os 30 do seed, que são
      quase disjuntos). Com isso o `tribunal/caos` ficava em 11, e juntou-se +1
      tema. **Nenhum nível do catálogo inteiro está agora abaixo de 12.**
      925 prompts ativos na BD.
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

- [x] **As quatro camadas "hardcore" (2026-09-03)** — pedido do João: mais jogos e
      intensidades mais fortes, com um "modo da morte". Ver `progress-log.md`.
      · **Modificadores** (`game/modificadores.js`): ⛓️ Sem Escape · 🎯 Alvo
        Marcado · 🔁 Dobro ou Nada · 🔒 Sem Anonimato · 📿 A Conta · 💀 Morte
        Súbita — mudam as REGRAS da noite, ortogonais à intensidade.
        ⚠️ **Escolhidos pelo host até 2026-09-04; a partir daí sorteiam-se** (ver
        entrada de 04 set abaixo).
      · **A Conta** (`game/divida.js`): adiar com juro, transferir (quem assume
        ganha uma vida), herdar de quem sai. Fecha no fim e no Cobrador.
      · **Seis tipos novos**: 💣 Bomba-Relógio · 🔨 Leilão · 🔗 Sincronia ·
        🕵️‍♂️ Detetor · ⚖️ Julgamento · 🤝 Contrato (~110 prompts). A roda passa
        de 18 para **24 tipos**.
      · **Modo da Morte** (`game/morte.js`): 4.º modo do lobby, mas implementado
        como CAMADA sobre a Roda — não duplica o motor (ver #3 das reestruturações).
      Princípio transversal, com testes dedicados: **nada disto manda beber mais**
      — mexe em vidas, em vez, em exposição e em risco de saída.
      Verificado: `npm test` **167/167** em 25 corridas seguidas; build limpo.
      **Por validar à mesa no playtest de 11 set.**

- [x] **As regras da noite passam a CALHAR (2026-09-04)** — pedido do João: em vez
      de o host escolher os modificadores no lobby, eles **sorteiam-se**, ponderados
      pela intensidade votada, muitas vezes mais do que um, e alguns caem **a meio
      da noite** com uma carta de ecrã inteiro. O host deixa de escolher e passa a
      **vetar** ("o que esta mesa não quer"), com o 🔒 Sem Anonimato vetado de
      origem. Regras temporárias ("durante 4 rondas") para a noite respirar.
      Ficheiros: `game/modificadores.js` (sorteio, veto, prazos), `game.js`
      (`initGame` + gancho entre rondas), `rooms.js` (`setVetados`), `socket.js`
      (`set_vetados`), `client/components/RegraNova.jsx` (novo), `Lobby.jsx`,
      `Game.jsx`, `Rules.jsx`. Verificado: `npm test` **182/182**, build limpo,
      smoke de 60 rondas a confirmar drops, prazos e expiração no feed.

- [x] **Telemetria + separador 📊 na /admin (2026-09-04)** — pedido do João:
      estatísticas "para nos podermos guiar". Descoberta a caminho: **nada do
      jogo era persistido** (as tabelas `Room`/`GameRound`/`LifeEvent` existem no
      schema e ninguém escreve nelas), por isso a maior parte do trabalho é a
      RECOLHA. `server/src/telemetria.js` conta, em agregado e sem nomes: por
      prompt, por tipo, por intensidade, por regra da noite (com o lado "sem"
      para comparar) e por noite (`fim` vs `abandonada`). Ficheiro + BD
      (`db/04_telemetria.sql`), degrada para só-ficheiro sem as tabelas. A página
      abre com **o que pede atenção** — decisões à espera — antes dos gráficos.
      Verificado: `npm test` **195/195** em 12 corridas + `/admin` real no Chrome
      com 14 noites simuladas.

- [x] **⚖️ Tribunal da Injustiça (2026-09-04)** — ideia do João, construída: tipo
      novo exclusivo do Hardcore (na Roda) e do Tabuleiro. 90 s para defender uma
      tese indefensável; a mesa é o júri. A prisão do Tabuleiro passa a ser uma
      ACUSAÇÃO (80% julgamento · 20% condenação direta) e ganha a hipótese que
      não tinha — absolvido, escapa à pena. 30 temas na BD, editáveis na /admin
      como todo o conteúdo. Verificado: `npm test` **209/209**, build limpo, e a
      /admin exercida no browser (criar e apagar um tema a sério).

- [x] **A sala de teste no showroom (2026-09-07)** — pedido do João: os demos
      mostravam os ecrãs, mas os botões não faziam nada, e para testar a sério uma
      feature nova era preciso montar uma noite. Agora cada cena tem um "▶ jogar"
      que abre a app REAL numa sala com bots, já dentro daquele jogo, e joga-se
      até ao fim. O que faltava não era a capacidade de jogar sozinho (os bots já
      existiam desde 09-01) — era a PONTARIA: encomendar o jogo que se quer ver.
      · `game.js`/`board.js`: `forcaProximoTipo` / `forcaProximaCasa`, consumidas
        no `spinWheel` e no `advance`, uma vez e só por quem as pediu
      · `socket.js`: `dev_playtest` (sala + bots + arranque num evento),
        `dev_force_next`, `dev_catalogo` — tudo atrás do `ENABLE_DEV_BOTS=1`
      · cliente: `playtest.js` (contrato no URL), `PlaytestBar.jsx` (encomendar o
        jogo seguinte sem sair da sala), botões no showroom e /admin com
        Vitrine ↔ Jogar
      Verificado: `npm test` **217/217** (`test/playtest.test.js` novo, 8 casos
      incluindo um e2e pela rede) e os quatro modos exercidos no Chrome — o
      Tribunal encomendado saiu, foi a votos e custou uma vida.
- [x] **…e a sala de teste passa a abrir em PRODUÇÃO (2026-09-07b)** — no Railway
      o `ENABLE_DEV_BOTS` não está ligado (nem deve estar), e era lá que o João
      queria experimentar. A /admin, que já pede a `ADMIN_PASSWORD`, passa a emitir
      um **bilhete** (`POST /admin/api/playtest-ticket`, uma hora, memória do
      processo) que destranca a sala de teste. O bilhete viaja no **fragmento** do
      URL (`#pt=…`) — não vai ao servidor nem ao Referer — e a app limpa-o do URL
      no arranque, guardando-o no `sessionStorage` do separador.
      Ficheiros: `server/src/devticket.js` (novo) · `admin.js` · `socket.js`
      (`exigePlaytest`) · `admin.html` · `client/src/playtest.js`.
      Verificado: `npm test` **220/220** (`test/playtest-gate.test.js` novo, que
      corre de propósito SEM a variável) e a /admin real no Chrome com o servidor
      sem `ENABLE_DEV_BOTS`: entrar, Demos, "▶ jogar" numa cena, sala de pé.
- [x] **1.º achado da sala de teste (2026-09-07c)** — e no primeiro dia: girar a
      roda para o ⚖️ Tribunal dava **ecrã em branco**. A fase `tribunal` nunca foi
      posta no `SPIN_PHASES` do `Game.jsx`, e sem isso o cartão do julgamento (que
      já existia) nunca era desenhado. Estava assim desde 04 set — nunca se viu
      porque o tipo só sai em hardcore/caos. Corrigido, e com guarda nova:
      `test/fases-do-cliente.test.js` compara as fases que o servidor produz com
      as que o cliente sabe desenhar (havia duas listas sem ninguém a
      compará-las). A lista da barra 🧪 deixou de ser um `<select>` nativo — abria
      com as cores do sistema e ficava ilegível. `npm test` **222/222**.

- [x] **☠️ A maldição passou a ver-se, e a ⚡ Reação passou a doer (2026-09-08)** —
      duas coisas que eram só texto. A maldição escondida numa casa (o melhor
      truque do Tabuleiro: alguém a plantou há dez minutos e ninguém sabia onde)
      disparava numa linha do `lastEvent` que a mesa lia depois de já ter passado
      à frente — agora tem encenação de ecrã inteiro própria: círculo de ritual,
      fumo a SUBIR (o contrário da tempestade do Evento da Noite) e o emoji a sair
      da casa. E na Reação o último a carregar deixou de pagar só dois golos:
      **perde uma vida**, como já acontecia na Mímica e no Relâmpago. Um falso
      arranque que não acabe em último continua a pagar só em golos.
      Ficheiros: `client/src/pages/board/MaldicaoOverlay.jsx` (novo) · `Board.jsx` ·
      `Demo.jsx` (cena nova ⚡ Reação) · `games/ReacaoCard.jsx` · `components/Rules.jsx` ·
      `server/src/board.js` (payload da maldição com `text`/`self`) ·
      `server/src/game/reacao.js` · `socket.js`.
      Verificado: `npm test` **224/224** (2 testes novos), `npm run build`, e as
      duas cenas no showroom em Chrome — a maldição abre, fecha-se sozinha e não
      tranca o tabuleiro.
- [x] **🐍 O azar da ganância também ganhou encenação (2026-09-08b)** — a única
      jogada do tabuleiro em que o jogador escolhe o próprio castigo tinha aviso
      a sério e cobrança a sussurrar (uma linha cor-de-rosa por baixo da pista).
      Ganhou a quarta linguagem de carta de ecrã inteiro: **aperta** — duas
      mandíbulas fecham sobre o centro, e a carta com o veredito entra no instante
      em que se juntam (é aí que o abanão dispara). O 1% que escapa recebe a mesma
      armadilha ao contrário: fecha, não apanha nada, volta a abrir. O
      `lastEvent.greed` deixou de ser um booleano e passou a objeto, com o número
      da jogada — que é o que torna dois castigos iguais seguidos distinguíveis.
      Ficheiros: `client/src/pages/board/GananciaOverlay.jsx` (novo) · `Board.jsx` ·
      `Demo.jsx` (cena nova para o 1%) · `server/src/board.js`.
      Verificado: `npm test` **224/224**, build limpo, e as duas cenas no showroom.

**Colega (BD)**
- [x] **`db/04_telemetria.sql` corrido** (confirmado 2026-09-08c na Supabase:
      `telemetry_nights` e `telemetry_counters` de pé, com 10 noites e 110
      contadores). As contagens da /admin já sobrevivem aos deploys.
- [ ] Troubleshooting de queries/performance durante os testes
- [ ] Validar estratégia de limpeza/arquivo de salas antigas
- [x] Seed corrido (2026-09-08c): 25 tipos · **730 prompts** · 49 itens de tabuleiro.
      Descoberta pelo caminho: o ⚖️ Tribunal tinha 20 temas na BD e 30 no código,
      **quase disjuntos** (só 2 coincidiam) — os 20 foram escritos na /admin.
      O seed é idempotente e não apagou nada, por isso ficaram os **48**.
      ⚠️ **Decisão para o João:** ficam os dois conjuntos ativos ou desativa-se um?

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
