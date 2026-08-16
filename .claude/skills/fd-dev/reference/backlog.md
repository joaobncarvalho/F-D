# F&D — Backlog & Ideias (LIVING)

Prioridades: **P0** = MVP indispensável · **P1** = MVP se der tempo · **P2** =
pós-MVP / v2 · **💡** = ideia nova a validar.

---

## Tipos de jogo (conteúdo do MVP)

| Jogo | Prioridade | Mecânica | Notas técnicas |
|---|---|---|---|
| **Boca Calada** ✅ | P0 | É feita ao jogador da vez uma **pergunta embaraçosa/difícil** (das perguntas que os jogadores escreveram no início, dirigidas uns aos outros). Ele pode dizer **"Boca Calada" e beber**, ou **responder e passar a vez**. | Implementado. Perguntas em memória (`room.game.questions`, por alvo). Fase 'questions' no início. Fallback ao banco seed se um jogador não tiver perguntas. |
| **Desafio** | P0 | Desafio direto, sem opção de "verdade" | Variantes solo/grupo |
| **Intrigas** | P0 | "Quem é mais capaz de…" — o grupo vota | Precisa de **votação anónima** (mecanismo dedicado) |
| **Segredos Anónimos** | P0 | Jogadores submetem segredo anónimo; grupo tenta adivinhar de quem é | **Anonimização real** no armazenamento e no payload; reveal manual/opcional |

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
- [ ] Contadores de vida animados; confetti/flash em eventos
- [ ] QR code do código de sala (juntar mais rápido numa festa)
- [ ] Copiar código para clipboard
- [ ] Estados de reconexão claros ("a religar…", "voltaste!")
- [ ] Empty states e feedback de erro amigáveis
- [ ] Música/sons ambiente durante roda e transições (toggle mute)
- [ ] Vibração (haptics) no telemóvel quando é a tua vez

## Estatísticas & social (P1)

- [ ] Ecrã de fim: "quem bebeu mais", "quem recusou mais vezes"
- [ ] `life_events` como log para estas estatísticas (já no schema)
- [ ] Partilha do resultado final (imagem/screenshot do pódio)

## Anti-abuso / robustez (P1)

- [ ] Servidor como autoridade em todas as validações
- [ ] Rate-limit no chat e nas submissões
- [ ] Sanitização de nomes e mensagens (já há trim/limite; rever XSS no render)
- [ ] Recuperação de sala após crash do servidor (snapshot opcional na BD)

---

## 💡 Ideias novas (a validar)

Estas vão além do FD — candidatas a diferenciar o jogo. Discutir prioridade.

- 💡 **Modo "história"/rondas temáticas** — sequência curada de prompts com arco
  (aquecimento → picante), em vez de puramente aleatório.
- 💡 **Cartas de sorte/azar** — eventos que mexem com as vidas: "troca de vidas
  com o jogador à tua direita", "todos bebem", "imunidade na próxima ronda".
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

## Fase 2 / v2 (P2)

- [ ] App nativa (o FD prevê web para MVP, nativa depois)
- [ ] Reavaliar backend em **Quarkus** para versão mais robusta / mobile
- [ ] Contas de utilizador e histórico pessoal
- [ ] Loja/packs de conteúdo
- [ ] Moderação de conteúdo submetido por utilizadores
