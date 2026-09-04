# F&D — Backlog & Ideias (LIVING)

Prioridades: **P0** = MVP indispensável · **P1** = MVP se der tempo · **P2** =
pós-MVP / v2 · **💡** = ideia nova a validar.

---

## Tipos de jogo (conteúdo do MVP)

| Jogo | Prioridade | Mecânica | Notas técnicas |
|---|---|---|---|
| **Boca Calada** ✅ | P0 | É feita ao jogador da vez uma **pergunta embaraçosa/difícil** (das perguntas que os jogadores escreveram no início, dirigidas uns aos outros). Ele pode dizer **"Boca Calada" e beber**, ou **responder e passar a vez**. | Implementado. Perguntas em memória (`room.game.questions`, por alvo). Fase 'questions' no início. Fallback ao banco seed se um jogador não tiver perguntas. |
| **Desafio** | P0 | Desafio direto, sem opção de "verdade" | Variantes solo/grupo |
| **Intrigas** ✅ | P0 | Pergunta secreta só a quem girou (acusador); escolhe alguém (o acusado NÃO sabe a razão); jogam pedra-papel-tesoura; se o acusado ganhar fica a saber, senão bebe e nunca saberá | Implementado. Razão entregue em **privado** (nunca no broadcast): acusador no spin, espectadores ao escolher, acusado só se ganhar o RPS. Substates choosing/rps/reveal; empate repete. |
| **Segredos Anónimos** ✅ | P0 | Segredos submetidos na prep (anónimos); grupo adivinha o autor; quem erra bebe (se todos acertam, o autor bebe) | Implementado. Autor nunca no payload; aviso privado `you_are_author` via sala por playerId. |

> Conteúdo guardado como dados estruturados (`game_types` + `prompts`) com
> categoria e intensidade (leve/picante), para crescer sem tocar em código.

---

## Core do motor de jogo (P0)

- [ ] Roda de seleção do tipo de jogo (animada) — o "efeito impressionante" pedido
- [ ] Rotação de vez (sequencial ou aleatória — decisão pendente)
- [ ] Fluxo de ronda: atribuir vez → mostrar prompt → aceitar/recusar → resolver
- [ ] Sistema de vidas: recusa → -1 vida + bebe copo; 0 vidas → shot
- [ ] Estado do jogo sincronizado (todos veem a mesma ronda/prompt/vez)
- [ ] Fim de jogo controlado pelo host

## Controlos do host (P1)

- [ ] Saltar jogador
- [ ] Remover jogador que saiu / desligado
- [ ] Terminar jogo a qualquer momento
- [ ] Configurar nº de vidas antes de começar (se decidido configurável)
- [ ] Escolher intensidade da sessão (leve / picante)

## Polish & UX (P1)

- [ ] Countdown 3-2-1 na transição para o jogo
- [x] Contadores de vida animados; confetti/flash em eventos
- [x] QR code do código de sala (juntar mais rápido numa festa)
- [x] Copiar código para clipboard
- [x] Estados de reconexão claros ("a religar…")
- [x] Empty states e feedback de erro amigáveis
- [x] Som sintetizado (Web Audio) na roda/eventos + toggle mute (`sfx.js`)
- [x] Vibração (haptics) em eventos-chave (`confetti.js` → haptic)
- [x] Redesign tema de festa (fundo animado, glass, gradientes, fonte display)
- [x] Timer visível/sonoro reutilizável (`components/Timer.jsx`) — usado no Boca Calada
- [x] Entrada tardia: painel amigável no `Home.jsx` (jogo a decorrer / nome / sala)

## Estatísticas & social (P1)

- [ ] Ecrã de fim: "quem bebeu mais", "quem recusou mais vezes"
- [ ] `life_events` como log para estas estatísticas (já no schema)
- [ ] Partilha do resultado final (imagem/screenshot do pódio)

## Anti-abuso / robustez (P1)

- [x] Servidor como autoridade em todas as validações
- [x] Rate-limit no chat e nas submissões (`util.throttled`: chat 400ms, submissões 150ms)
- [x] Sanitização de nomes e mensagens (`util.sanitizeText`: controlo+espaços+limite).
      Render é via React (escapa por defeito) — sem `dangerouslySetInnerHTML`.
- [x] **Testes automatizados dos invariantes** (`server/test/*`, `npm test`) — anonimato,
      rotação, eliminação, cartas privadas. Correr antes de cada commit.
- [x] **Log estruturado** (`log.js`) + safety net de processo (não deita o servidor abaixo).
- [x] **Recuperação de sala após reinício** — `snapshot.js` (ficheiro; passar à BD
      é o passo seguinte, para sobreviver a trocas de máquina no deploy)

---

## ✅ Feitas em 2026-09-01 (eram ideias, passaram a jogo)

- [x] **Modo espectador / ecrã partilhado** — `/?tv=CODIGO` (`pages/Display.jsx`),
      entra por `watch_room` sem ocupar lugar.
- [x] **Intensidade adaptativa** — curva: a votação é o teto, começa leve e sobe.
- [x] **Pack de conteúdo por ocasião** — `tag` no prompt + CRUD na /admin.
- [x] **Perfis leves persistentes** — nome/emoji/cor e salas recentes em localStorage.
- [x] **Acessibilidade** — texto grande + alto contraste (⚙️).
- [x] **Partilha do resultado final** — cartão PNG (canvas) nos três modos.
- [x] **Jogos de mesa inteira** — Eu Nunca · Mais Provável · Termómetro · Quem Disse
      · Cascata · Desenha · Reação (era o buraco do catálogo: quase tudo girava à
      volta do jogador da vez).
- [x] **Modo "duelo"** — Reação como duelo do Torneio e casa do Tabuleiro.
- [x] **Recuperação de sala após crash do servidor** — `snapshot.js`.

## 📋 Vindo do 1.º playtest (2026-09-01) — feito

- [x] Beer Pinga: bug do 2.º jogador seguido + medidor lento (era rápido de mais
      e dependente da taxa de refrescamento do ecrã)
- [x] Cara ou Coroa com moeda animada, lançada pela app
- [x] Torneio "fazível" com 6 pessoas: apostas + final à melhor de 3
- [x] Casa ?? com banco 3× maior e probabilidades afinadas

## 🏗️ Reestruturações grandes (2026-09-02)

As cinco que mexem na FORMA do jogo, por ordem de retorno. #1 e #2 feitas.

- [x] **#1 O Diretor** — a roda passa a encenação: lê a mesa (quem anda calado,
      quem está a levar com tudo, que carga saiu nas últimas rondas, em que ponto
      vai a noite) e escolhe o momento. Desbloqueia um FIM: com duração planeada,
      anuncia a última ronda e fecha sozinho. `server/src/game/director.js`.
- [x] **#2 Acabar com o espetador** — segunda camada em cada ronda: enquanto um
      joga, a mesa aposta; quem erra bebe 2. Ligada aos 5 tipos em que a plateia
      não tinha nada que fazer. `server/src/game/palpites.js`.
- [ ] **#3 Fundir os três modos** — o Tabuleiro como casca (progressão), a Roda
      como motor de conteúdo, o Torneio como fase final. Mata a duplicação de
      ordem-de-vez / stats / intensidade / feed / fim-de-jogo nos três motores
      (~1900 linhas). **Depois do playtest de 11 set** — é o único desta lista
      que desestabiliza o que já funciona, e precisa de validação à mesa.
- [ ] **#4 O grupo como entidade** — memória entre noites (os mesmos jogadores,
      as noites anteriores, as respostas antigas) para o conteúdo se virar para
      dentro: callbacks ao que aquelas pessoas fizeram no mês passado. Pouco
      schema, retorno desproporcional. Precisa de combinar com o colega (BD).
- [ ] **#5 Estado privado como mecânica central** — generalizar a mão de cartas
      privadas do Tabuleiro a todos os modos (imunidade, obrigar a beber, trocar
      destino). Assenta melhor depois de o #2 ser visto ao vivo: é a mesma ideia
      de dar agência à plateia.

---

## 💀 Camadas "hardcore" (2026-09-03) — feitas

O pedido foi "mais jogos e intensidades mais hardcore, incluindo um modo da
morte". A decisão de desenho que sustenta as quatro camadas: **hardcore não é
mais álcool** (satura em duas rondas e é o único vetor perigoso) — é risco
social e risco de estado. **Nada disto manda beber mais do que o jogo normal**;
tudo mexe em vidas, em vez, em exposição e em risco de saída. Ver
`progress-log.md` de 2026-09-03 e os cabeçalhos dos módulos.

- [x] **Modificadores da noite** (`game/modificadores.js`) — ⛓️ Sem Escape ·
      🎯 Alvo Marcado · 🔁 Dobro ou Nada · 🔒 Sem Anonimato · 📿 A Conta ·
      💀 Morte Súbita. Ortogonais à intensidade.
- [x] **…e a partir de 2026-09-04 CALHAM em vez de se escolherem** — sorteados
      pela intensidade votada, vários por noite, alguns a cair a meio com carta
      de ecrã inteiro e prazo. O host passa a vetar; 🔒 Sem Anonimato vetado de
      origem. Ver `progress-log.md` de 04 set.
- [x] **A Conta** (`game/divida.js`) — adiar (com juro), transferir (quem assume
      ganha uma vida) e herdar. Fecha no fim da noite e no evento do Cobrador.
- [x] **Seis tipos novos** — 💣 Bomba-Relógio · 🔨 Leilão · 🔗 Sincronia ·
      🕵️‍♂️ Detetor · ⚖️ Julgamento · 🤝 Contrato (~110 prompts).
- [x] **Modo da Morte** (`game/morte.js`) — CAMADA sobre a Roda, não um quarto
      motor. Não há recusar · quem sai vira fantasma (cartas + testamento) ·
      o relógio encurta · acaba num duelo entre os dois últimos.

### 📋 Vindo do playtest de 2026-09-03 — feito
- [x] **A Última Ronda não acabava** — perder um duelo só custava goles, por isso
      o "duelo final" nunca eliminava ninguém e repetia-se para sempre. No Modo
      da Morte a derrota passa a custar uma vida, e no duelo final **elimina**.
- [x] **Onze duelos em vez de três** — saíam sempre cara ou coroa e braço de
      ferro. +8 resolvidos à mesa (pedra-papel-tesoura, olhares, gatilho, dedos,
      quem ri primeiro, numa perna só, à vez sem repetir, memória).

**Por testar à mesa** (playtest de 11 set): a cadência do sorteio (7–12 rondas), os
tetos por intensidade, se o prazo de 3–5 rondas chega para a regra se fazer sentir, e
o Modo da Morte com 5+ pessoas — é aí que os fantasmas ganham massa crítica.
Perguntas em aberto para o playtest: Duas vidas no Modo da Morte é curto de mais?
O teto de 10 goles da Conta chega para haver negociação a sério?

- [x] **O pavio da Bomba (2026-09-04)** — RESPONDIDO à mesa: uma bomba chegou às
      **40 passagens**. Não era avaria — o pavio contava segundos e a tensão
      conta-se em VOLTAS. Passou a haver um segundo pavio em passagens (2 a 3,5
      voltas, escalado com a mesa), com o relógio encurtado para 14–42 s e um
      chão de 12 s. Simulado: 27→13 passagens numa mesa de 5 a ritmo normal, e a
      duração deixou de ser sempre ~40 s para acompanhar a velocidade da mesa.

---

## ⚖️ Tribunal da Injustiça (ideia do João, 2026-09-04) — ✅ FEITO

Tipo novo, **exclusivo do Hardcore e do Tabuleiro**. O acusado tem tempo para
defender uma teoria/ideologia ridícula; a mesa é o júri e decide a sentença.

**Porque é boa:** é a primeira coisa no jogo que pede a alguém para *falar bem*
durante um bocado, e a graça está em ver uma pessoa a defender com toda a
seriedade uma coisa indefensável. Encaixa exatamente onde o Tabuleiro tinha um
buraco — a prisão, que hoje é uma sentença anónima tirada do banco `prisao` e à
qual ninguém pode reagir.

**A integração (o ponto que a torna mais do que mais um tipo):**
ir preso deixa de ser um resultado e passa a ser uma **acusação**. No
`board/core.js` → `applyPrison` (três chamadores: streak lento, casa de prisão,
carta `curse_prison`), sorteia-se:

| | |
|---|---|
| **80%** | ⚖️ vai a **julgamento** — defende-se e o júri decide |
| **20%** | 🚔 **condenação direta** — o azar, o que já existe hoje |

Isto dá à prisão uma coisa que não tinha: **hipótese**. Uma absolvição tem de
ser possível, senão o julgamento é teatro e a mesa aprende a ignorá-lo.

**Notas de construção (para quando for feito):**
- O júri vota pelo `game/veredito.js` que JÁ EXISTE (rótulos configuráveis — o
  Julgamento e a Mímica já o usam). Não montar um segundo sistema de votação.
- A sentença sai do banco `prisao` (`board_items`) que já existe: absolvido ·
  pena do banco · pena a dobrar. Nada de tabela nova.
- Prompts em `content/prompts.data.js` + `/admin`, com `intensity: 'hardcore'`,
  como todo o conteúdo.
- Contabilizar na telemetria como qualquer tipo (sai/aceite/recusado).

**As duas decisões, tomadas:**

1. **Os 3 minutos.** É muito para este jogo: são 3 minutos com uma pessoa a
   falar e sete a ouvir, exatamente o que o Diretor passa a vida a evitar (a
   Pirâmide e o Vasco já são os tipos que mais cansam, e são de ~5 min). Sugiro
   **60–90 s**, com o `Timer.jsx` à vista. A dizer à mesa "tens um minuto e meio"
   também force a defesa a ser densa, que é onde está a piada. **Decisão do João.**
2. **O registo do conteúdo.** O João disse "pode ser misógina, racista, tu
   percebes". Escrevo os prompts como **posições absurdas e provocadoras**, não
   como defesas sinceras de racismo ou misoginia — e não por escrúpulo, por
   desenho: a graça é defender algo *indefensível e inofensivo* com cara séria.
   Pedir a alguém para argumentar a sério, durante um minuto e meio e em voz
   alta, que as mulheres são inferiores, numa mesa onde está a namorada dela, é
   o único prompt do jogo capaz de acabar com a noite em vez de a fazer. Registo
   provocador que funciona:
   - *Defende que dividir a conta ao meio é roubo e devia dar cadeia.*
   - *Defende que devias poder despedir um amigo, com pré-aviso de 30 dias.*
   - *Defende que quem não bebe não devia ser convidado para sair.*
   - *Defende que o casamento devia ser renovado de 5 em 5 anos, com entrevista.*
   - *Defende que a tua ex tinha razão em tudo.*
   - *Defende que ler livros em público é uma forma de exibicionismo.*
   - *Defende que os animais de estimação deviam pagar renda.*

---

## 💡 Ideias novas (a validar)

Estas vão além do FD — candidatas a diferenciar o jogo. Discutir prioridade.

- 💡 **Modo "história"/rondas temáticas** — sequência curada de prompts com arco
  (aquecimento → picante), em vez de puramente aleatório.
- ~~💡 **Cartas de sorte/azar**~~ — feito em duas frentes: o Evento da Noite
  (2026-09-02) e as cartas de fantasma do Modo da Morte (2026-09-03).
- 💡 **Alvos direcionados** — em certos prompts, o jogador da vez escolhe **a
  quem** dirige o desafio (mais interação de grupo).
- 💡 **Votação "MVP da ronda"** — no fim de cada ronda o grupo vota no melhor
  momento; alimenta estatísticas divertidas no fim.
- 💡 **Modo "duelo"** — dois jogadores frente a frente num mini-desafio, perde
  quem falhar (rock-paper-scissors, quiz relâmpago, reação).
- 💡 **Pack de conteúdo por ocasião** — "aniversário", "despedida de solteiro/a",
  "reencontro" — filtra prompts por tag/tema.
- 💡 **Editor de prompts na app** (host) — adicionar prompts próprios à sala,
  guardados como conteúdo da sala (liga à decisão pendente #3).
- 💡 **Modo espectador / ecrã partilhado** — um ecrã grande (TV/portátil) mostra
  a roda e o estado geral; telemóveis são só comando (mais "party").
- 💡 **Timer sonoro/visual reutilizável** — componente para Boca Calada e futuros
  jogos com tempo.
- 💡 **Perfis leves persistentes** (opcional) — reconhecer "o mesmo grupo" entre
  sessões sem login pesado (liga à decisão pendente #4).
- 💡 **Intensidade adaptativa** — o jogo sobe/desce a intensidade conforme o ritmo
  (ex.: mais leve se muitos estão a recusar).
- 💡 **Modo offline/1 telemóvel** (passar o telemóvel à volta) — para grupos sem
  wifi fiável; fallback do modo realtime.
- 💡 **Acessibilidade** — tamanhos de fonte, alto contraste, feedback não só por cor.
- 💡 **i18n** — PT primeiro, mas estrutura de conteúdo pronta para EN.

---

## Dívida técnica / incrementos em curso (P1)

- [x] **Modularizar `Game.jsx`** (1501 → **600 linhas**) — todas as cartas dos mini-jogos
      em `pages/games/`: `shared.jsx` (TYPES/CardShell/BuddyBlock), `cards.jsx`
      (Prompt/Choice/Intrigas), `GuessingCard.jsx`, `PiramideCard.jsx` (+PlayingCard/
      PyramidBoard), `VascoCard.jsx`. Comportamento idêntico (build ✓).
- [x] **Modularizar `Board.jsx`** (1173 → **603 linhas**) — overlays/mini-jogos em
      `pages/board/`: `blackjack.jsx` (PlayingCard/BlackjackReveal), `reveals.jsx`
      (Gamble/CardPlay/Order), `Beerpong.jsx`, `EventoOverlay.jsx`. Idêntico (build ✓).
- [x] **Modularizar o servidor** — `game.js` **1125 → 509** (`game/{helpers,piramide,vasco,
      intrigas,segredos}.js`); `board.js` **886 → 530** (`board/{core,blackjack,beerpong,
      evento}.js`); `socket.js` **630 → 561** (`socket/boardHandlers.js`). Protegido pela
      suite (invariantes + e2e Roda **e** Tabuleiro; prova de código idêntico em cada passo).
      _Opcional:_ extrair também os handlers da Roda do `socket.js` (mexem em emits privados —
      melhor com um harness de socket primeiro).
- [x] **Bots de playtest no Tabuleiro** — `driveBoardBots` (pawn/roll/advance/resolve/
      blackjack/beerpong/gamble/??). Teste `board-e2e.test.js` corre até ao fim.
- [ ] Alargar a suite de testes ao motor do Tabuleiro (`board.js`) e ao `repo.js`.

## Fase 2 / v2 (P2)

- [ ] App nativa (o FD prevê web para MVP, nativa depois)
- [ ] Reavaliar backend em **Quarkus** para versão mais robusta / mobile
- [ ] Contas de utilizador e histórico pessoal
- [ ] Loja/packs de conteúdo
- [ ] Moderação de conteúdo submetido por utilizadores

---

## 🐛 Armadilha conhecida: o guarda `ref` que come o relógio

Apanhado num playtest (2026-09-04): cartas de ecrã inteiro ficavam presas por
cima do jogo e não saíam mais. Vale a pena reconhecer o padrão, porque ele
apetece escrever e parece certo:

```js
useEffect(() => {
  if (jaFiz.current) return;      // ⚠️ guarda à frente de tudo
  jaFiz.current = true;
  sfx.algo();
  const t = setTimeout(fecha, 3000);
  return () => clearTimeout(t);
}, []);
```

O React monta o efeito, limpa-o e volta a montá-lo (StrictMode, em dev — e é em
`npm run dev` que se fazem os playtests). A **primeira** passagem arma o relógio,
a limpeza apaga-o, e a **segunda** sai pelo guarda sem voltar a armar nada. Fica
uma carta no ecrã sem nada que a tire — e nenhuma delas responde a toques.

**Regra:** o que fecha (relógio, subscrição, estado) é armado SEMPRE e limpo
SEMPRE; o guarda serve só ao que não pode repetir-se — som, confetti, abanão. E
esses vão dentro de `try/catch`, para um telemóvel sem vibração não prender nada.

Corrigidos assim: `EventoDaNoite.jsx`, `RegraNova.jsx`, `board/EventoOverlay.jsx`
(carta da casa ??) e `board/Beerpong.jsx` (a bola ficava no ar para sempre).
