# F&D — Base de dados

A app **corre sem base de dados**: se `DATABASE_URL` não estiver definido (ou se a
BD falhar), o `repo.js` cai para o conteúdo em código (`src/content/*.data.js`) e
o jogo funciona na mesma. A BD serve para o que precisa de **persistir**: o
conteúdo editável na `/admin`, os packs temáticos, e o retrato das salas que
permite sobreviver a um redeploy.

## O caminho normal (com `.env` configurado)

```bash
cd server
npm run db:sync     # prisma db push + prisma db seed
```

`db:sync` põe o schema em dia (incluindo a coluna `tag` dos packs e a tabela
`room_snapshots`) e semeia os 18 tipos / 360 prompts. É idempotente — pode
correr-se as vezes que forem precisas.

> Precisa de `DATABASE_URL` e `DIRECT_URL` no `server/.env` (ver `.env.example`).

## O caminho sem `.env` (SQL editor da Supabase)

Se não tiveres as credenciais à mão, ou quiseres que o colega da BD reveja antes,
os mesmos efeitos estão em SQL puro:

| Ficheiro | O que faz |
|---|---|
| `01_schema.sql` | Cria **ou atualiza** enums, tabelas, índices e FKs. Idempotente. |
| `02_seed.sql` | Semeia `game_types` (18) e `prompts` (360), com `buddy`/`duration`/`tag`. Idempotente. |
| `03_board_items.sql` | Schema + seed dos bancos do Tabuleiro (?? / prisão / cartas / regras). |

**Supabase:** Dashboard → SQL Editor → cola cada ficheiro e corre, por esta ordem.

**psql:**
```bash
psql "$DIRECT_URL" -f server/db/01_schema.sql
psql "$DIRECT_URL" -f server/db/02_seed.sql
psql "$DIRECT_URL" -f server/db/03_board_items.sql
```

Todos podem ser re-executados sem erro nem duplicados.

### Numa BD que já existe

O `01_schema.sql` é "cria **ou** atualiza": a seguir aos `CREATE ... IF NOT EXISTS`
traz um bloco que acrescenta cada coluna e cada valor de enum em falta. É o que
põe em dia uma BD criada antes de existirem o `hardcore`/`caos`, o `buddy`, o
`duration`, o `tag` e a tabela `room_snapshots` — sem apagar nada.

## Não editar o `01`/`02` à mão

São **gerados** a partir das fontes de verdade da app:

```
prisma/schema.prisma        →  01_schema.sql
src/content/prompts.data.js →  02_seed.sql   (o mesmo banco do prisma/seed.js)
```

Depois de mexer no schema ou no conteúdo:

```bash
npm run db:sql      # regenera 01 e 02
```

Foi assim que se resolveu a deriva que estes ficheiros tinham (tinham ficado nos
4 tipos originais e num enum de intensidade sem `hardcore`/`caos`). Escritos à
mão, voltariam a derivar.

O `03_board_items.sql` continua a ser mantido à mão — o seu conteúdo é o banco
inicial do tabuleiro, não um espelho direto de um ficheiro de dados.

## Tabelas

| Tabela | Para quê |
|---|---|
| `game_types`, `prompts` | Conteúdo dos mini-jogos. `intensity` (leve→caos), `buddy`, `duration`, `tag` (pack temático). Editável na `/admin`. |
| `board_items` | Bancos do Tabuleiro: casa ??, prisão, cartas, regras. Editável na `/admin`. |
| `room_snapshots` | Retrato do estado quente das salas (`src/snapshot.js`). Efémero: uma linha por sala, apagada quando a sala acaba ou passadas 6h. |
| `rooms`, `players`, `chat_messages`, `game_rounds`, `life_events` | Histórico/auditoria. O jogo em si não lê daqui — o estado quente vive em memória. |

## Notas

- **O estado do jogo não vive na BD.** Vive em memória (`src/rooms.js`), por
  latência. A `room_snapshots` é só a rede de segurança para reinícios.
- A `/admin` exige `ADMIN_PASSWORD` **e** BD: sem uma delas devolve 503.
- Se a BD estiver em baixo a meio de uma festa, o jogo continua com o conteúdo em
  código. Perde-se o que foi editado na `/admin`, não a noite.
