# F&D — Modo Tabuleiro ("Monopólio de bebida")

> Modo de jogo **separado da roda** (escolhido no lobby). Corrida num tabuleiro em
> anel: avança-se bebendo golos; ganha quem der a volta primeiro. Decidido com o
> João (2026-08-19). Construir por FASES.

## Núcleo (decidido)
- **Movimento:** na tua vez escolhes avançar **1/2/3 casas = 2/4/6 golos** (máx 3
  casas/vez). Bebes e andas. Não há dado para andar (o dado é só para a ordem).
- **Vitória:** **corrida** — 1.º a completar a volta (voltar à **Partida**) ganha.
  Prémio à parte: "bebeu mais golos". (Sem sistema de vidas neste modo — proposto.)
- **Prisão:** NÃO é uma casa onde se cai a andar. Vai-se preso por **consequência**:
  (a) **abuso** = avançar só **1 casa em 3 vezes seguidas**; (b) efeito de mini-jogo
  ou de casa **??**. Consequências aleatórias (perde vez(es)/bebe/recua/perde carta…).
- **Casas do tabuleiro:** mini-jogos (os 7 tipos, colocados ao acaso a cada partida)
  + **??** (sorte) + **Gamble** (aposta) + **Partida** + neutras.
- **Cartas/traits:** inventário desde já — ganhas em ??/Gamble, jogas contra outros.

## Detalhes (CONFIRMADOS com o João)
- **Sem vidas/eliminação** neste modo. Foco: corrida + golos.
- **Tabuleiro:** anel de **45 casas**. 1 Partida + eventos (**?? e Gamble, mais
  raros**) + o resto **mini-jogos**, distribuídos pela **probabilidade da roda**
  (`pickWeightedType`: piramide ~10%, os outros 6 tipos ~15% cada). Gerado ao acaso
  a cada partida. Adicionar jogos novos à medida que surgirem (menos repetição).
  Números Fase-1: 1 Partida · 5 ?? · 3 Gamble · 36 mini-jogo (por peso da roda).
- **Peões:** cada jogador escolhe um emoji (🦊🐸🐵🦄🐙🐝🦁🐨…) ao entrar no modo.
- **Ordem inicial:** cada um lança o dado (animação) → ordem do maior p/ menor
  (empate → re-lança entre empatados).
- **Vez de um jogador:**
  1. (opcional) jogar uma **carta** contra alguém.
  2. **Avançar** 1/2/3 casas (bebe 2/4/6 golos, máx 3).
  3. mover o peão; se completa a volta → **vitória**.
  4. **resolver a casa**: mini-jogo (joga) · ?? (sorte) · Gamble (aposta golos:
     acerta avança N / falha recua N / não aposta fica) · Partida/neutra (nada).
  5. **abuso** (3× 1 casa) → prisão.
- **?? (banco, editável na admin):** ganha carta · avança/recua 1-3 · troca de sítio
  · escolhe alguém p/ beber · salta a próxima vez · vai preso · imunidade.
- **Prisão (banco):** perde 1-2 vezes · bebe X · recua N · perde 1 carta · "os outros
  avançam 1".
- **Catálogo de cartas (MVP, 1 uso cada):**
  - 🔁 Troca — trocas de casa com um jogador
  - ⬅️ Empurrão — mandas alguém recuar 2
  - ⛓️ Denúncia — mandas alguém p/ a prisão
  - ⏭️ Salta-vez — um jogador perde a próxima vez
  - 🛡️ Escudo — bloqueia a próxima carta usada contra ti
  - 🍺 Ronda — obrigas alguém a beber 3 golos (não anda)
  - 🎁 Roubo — roubas uma carta a alguém

## Plano por fases (ordem de construção)
- **Fase 1 — fundação ✅:** modo no lobby, peões, ordem (dado), pista de 45 casas,
  avançar-por-golos (cap 3), dar a volta = vitória, prisão por abuso.
- **Fase 2 — casas especiais ✅:** mini-jogo (só os **rápidos single-player**:
  Boca Calada/Desafio/Isto ou Aquilo — os de grupo ficam na Roda) · ?? (banco de
  sorte auto) · Gamble (aposta 50/50). Prisão passou a ter **consequência aleatória**.
- **Fase 3 — cartas/traits ✅:** inventário (ganhas em ??), joga na tua vez contra
  outros: 🔁 Troca · ⬅️ Empurrão · ⛓️ Denúncia · ⏭️ Salta-vez · 🛡️ Escudo (bloqueia)
  · 🍺 Ronda · 🎁 Roubo.
- **Fase 4 — bancos na BD + cartas privadas ✅ (2026-08-20):**
  - Bancos **??/prisão/cartas** movidos para `board_items` (Prisma) + CRUD na /admin
    (separador 🎲 Tabuleiro). Fallback em `content/board.data.js`. Snapshot em
    `b.banks` no `initBoard` (os handlers síncronos leem-no sem `await`). Os efeitos
    do ?? são **tipados** (`advance|back|drink|card|prison|others_drink` + `value`);
    a prisão são efeitos combinados; as cartas são um catálogo (mecânica fixa por `key`).
  - Cartas **privadas**: a mão vai por `board_hand` (canal do jogador); o broadcast
    só leva `cardCount`. O `serializeBoard` já não expõe as cartas dos outros.
  - Estatísticas de fim: `prisonCount` + `cardsPlayed` → ecrã de fim com "prémios".

## Arquitetura (notas)
- Estado do tabuleiro em memória (`room.board` / `game`), como os outros modos.
- Novo conjunto de eventos socket (escolher peão, lançar ordem, avançar, apostar,
  jogar carta, resolver casa…). Documentar em `architecture.md` à medida.
- Reusa o motor dos mini-jogos para as casas de jogo (sem duplicar).
- Conteúdo (??/prisão/cartas) como bancos **na BD/admin** (`board_items`), com fallback
  em código (`content/board.data.js`). ✅ feito na Fase 4.
