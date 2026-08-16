---
name: fd-dev
description: >-
  Companion de desenvolvimento do jogo F&D (Friends and Drinking) — party game
  multiplayer realtime. Usa esta skill ao continuar o desenvolvimento do F&D,
  ver o estado/progresso, decidir o próximo passo, planear features, ou registar
  o que foi feito. Cobre roadmap, backlog, arquitetura, convenções, contrato de
  eventos Socket.io, setup da base de dados (Supabase/Prisma) e ideias novas.
  Triggers: "F&D", "Friends and Drinking", "jogo de bebida", trabalhar em
  fd/server ou fd/client, "próximo passo", "o que falta", "roadmap do jogo".
---

# F&D — Companion de Desenvolvimento

Skill viva para conduzir e acompanhar o desenvolvimento do **F&D — Friends and
Drinking**: um party game multiplayer em tempo real, presencial, cada amigo no
seu telemóvel ligado à mesma sala (estilo Kahoot/Jackbox), com desafios sociais
e um sistema de vidas que penaliza recusas com bebida.

> Documento de design original: `fd/FD.pdf` (ou `FD.pdf` na pasta acima).
> Esta skill é a fonte de verdade **operacional** — o PDF é a visão; aqui está
> o estado real, o que já corre, e o que vem a seguir.

## Como usar esta skill

Consoante o que o utilizador pedir:

- **"Em que ponto estamos?" / "o que falta?"** → lê `reference/roadmap.md` e o
  topo de `reference/progress-log.md`, resume o estado, propõe o próximo passo.
- **"Vamos continuar" / "próximo passo"** → segue o **Workflow** abaixo.
- **"Adiciona/planeia feature X"** → regista em `reference/backlog.md` com
  prioridade e liga ao roadmap se aplicável.
- **Setup de BD / Supabase / Prisma** → segue `reference/db-setup.md`.
- **Dúvida de arquitetura, modelo de dados, ou eventos de socket** → consulta
  `reference/architecture.md`.

**Idioma:** o utilizador (João) trabalha em português — responde em PT-PT.
Comentários de código e UI também em PT.

## Workflow para continuar o desenvolvimento

1. **Orienta-te.** Lê `reference/roadmap.md` (o que está feito ✅ / a seguir) e
   as entradas recentes de `reference/progress-log.md`.
2. **Escolhe o próximo item** — normalmente o primeiro por fazer da semana atual
   do roadmap; se o utilizador pediu algo específico, esse.
3. **Respeita as Regras de Ouro** (abaixo) e o contrato de eventos em
   `reference/architecture.md`.
4. **Implementa** de forma incremental e mobile-first.
5. **Verifica de verdade** (secção Verificação) — não digas "feito" sem exercer
   o comportamento. Build tem de passar; lógica nova precisa de smoke test.
6. **Atualiza os trackers:** marca o item em `reference/roadmap.md` e acrescenta
   uma entrada datada no topo de `reference/progress-log.md` (o que mudou,
   ficheiros, como foi verificado).
7. **Fecha o ciclo:** resume ao utilizador o que ficou feito, o que falta, e a
   próxima decisão em aberto (se houver).

## Regras de Ouro (convenções do projeto)

1. **Realtime primeiro.** Tudo o que muda o estado da sala (jogador entra, roda
   para, vida perdida) tem de chegar a todos os clientes via Socket.io. Nunca
   assumas que um cliente sabe algo que não foi broadcast.
2. **Estado da sala vive em memória** (`server/src/rooms.js`, `RoomManager`,
   `Map` por sala) para latência mínima. A BD (Postgres/Prisma) serve só para o
   que precisa de **persistir**: conteúdo dos jogos (prompts), histórico,
   estatísticas, e snapshot opcional para recuperação.
3. **A forma dos dados em memória espelha o schema da BD** (ver
   `reference/architecture.md`). Isto é deliberado: a troca de mock in-memory por
   Prisma client (Semana 3) tem de ser uma **substituição localizada, não uma
   reescrita**.
4. **O servidor é a autoridade.** Validações (nome único, vidas, vez do jogador,
   quem é host, anonimato dos segredos) acontecem no servidor. O cliente é só
   "comando" e ecrã.
5. **Mobile-first, um só ecrã.** Cada jogador usa o telemóvel na vertical.
   Nada de layouts que assumam rato ou ecrã largo.
6. **Reconexão é requisito, não luxo** — telemóveis + wifi de festa vão cair.
   Socket.io reconecta; o estado tem de ser recuperável (re-emitir `room_state`).
7. **Anonimato real nos Segredos** — o autor nunca pode aparecer no payload de
   rede enquanto não for revelado. Testar isto explicitamente.
8. **Conteúdo é dados, não código** — prompts vivem na BD (`game_types` +
   `prompts`), com categoria e intensidade (leve/picante). Adicionar conteúdo
   nunca deve exigir alterar código.

## Divisão de trabalho

- **João (utilizador):** app, realtime, animações → `fd/client` + `fd/server`.
- **Colega:** base de dados → `schema.prisma`, migrations, seed de prompts.
- Trabalham **em paralelo**: enquanto o schema não está estável, a app corre
  contra estruturas em memória com a mesma forma. Ponto de integração na Semana 3.

**Deadline MVP: 11 setembro 2026.**

## Verificação (não pular)

```bash
# Backend arranca e responde
cd fd/server && npm run dev
curl -s http://localhost:3001/health            # -> {"ok":true,...}

# Lógica de salas (smoke test rápido, sem rede) — ver exemplos em architecture.md

# Frontend compila
cd fd/client && npm run build                    # tem de terminar sem erros

# Teste manual do realtime: dois separadores do browser em localhost:5173
#   1) Criar sala num, copiar código
#   2) Juntar no outro com o código
#   3) Confirmar: lista de jogadores + chat sincronizam nos dois em tempo real
```

Para telemóveis reais na mesma rede: `npm run dev` no client dá um endereço
"Network"; define `VITE_SERVER_URL=http://<IP>:3001` em `client/.env`.

## Ficheiros de referência

- `reference/roadmap.md` — plano semana-a-semana com checkboxes (LIVING — atualiza).
- `reference/backlog.md` — features e ideias priorizadas (core / polish / stretch / novas ideias).
- `reference/architecture.md` — modelo de dados (memória ↔ Prisma), mapa de ficheiros, contrato de eventos Socket.io, convenções.
- `reference/db-setup.md` — setup Supabase + Prisma, o que é preciso, como correr migrations e seed.
- `reference/progress-log.md` — diário datado do que foi feito (LIVING — acrescenta no topo).

## Perguntas em aberto (decidir em equipa)

Ver `reference/roadmap.md` §"Decisões pendentes". As que bloqueiam a Semana 3:
1. Nº de vidas por defeito — e configurável pelo host antes de começar?
2. Vez do jogador — sequencial (por ordem) ou aleatória a cada ronda?
3. Host pode editar/adicionar prompts próprios, ou só conteúdo fixo no MVP?
4. Persistência entre sessões (guardar o mesmo grupo) ou cada sala do zero?
