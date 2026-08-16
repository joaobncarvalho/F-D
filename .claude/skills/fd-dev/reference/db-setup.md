# F&D — Setup da Base de Dados (Supabase + Prisma)

> No FD, a BD é da responsabilidade do **colega**. Este guia serve para arrancar
> a BD e correr os scripts de inicialização — quer seja o colega, quer sejas tu
> a preparar o terreno. O ORM (Prisma) é o "contrato" entre os dois.

## O que é preciso da Supabase (resposta curta)

Para ter BD a funcionar e correr as migrations + seed, preciso de **3 coisas**:

1. **Um projeto Supabase criado** (free tier chega para o MVP).
   → https://supabase.com → New project → escolher região (ex.: EU/Frankfurt),
   definir uma **Database password** (guardar!).

2. **Duas connection strings** (Supabase dá as duas no dashboard):
   - **`DATABASE_URL`** — ligação *pooled* (Supavisor, porta **6543**), usada pela
     app em runtime.
   - **`DIRECT_URL`** — ligação *direta* (porta **5432**), usada pelo Prisma para
     correr **migrations**.

   Onde copiar: Dashboard → botão **Connect** (topo) → separador **ORMs / Prisma**
   (ou *Connection string*). Copiar exatamente as duas strings de lá — já vêm no
   formato certo, com o placeholder `[YOUR-PASSWORD]` para substituir.

3. **A password da BD** para meter nas strings (o `[YOUR-PASSWORD]` acima).

Nada disto vai para o git — vai para `server/.env` (já ignorado).

### Formato típico das strings (referência)

```
# pooled (runtime) — nota o pgbouncer=true e a porta 6543
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"

# direta (migrations) — porta 5432
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

> Usa **sempre** os valores exatos do dashboard — o host/região/ref variam por
> projeto. Se a password tiver caracteres especiais, URL-encode.

## O que EU trato (não precisa da Supabase)

Isto pode ser feito já, sem credenciais — só a execução final precisa das strings:

- [ ] Adicionar Prisma ao `server` (`prisma` dev-dep + `@prisma/client`).
- [ ] `prisma/schema.prisma` a partir do modelo em `architecture.md`.
- [ ] `prisma/seed.js` com o banco inicial de prompts (Boca Calada, Desafio,
      Intrigas, Segredos — ~20-30 cada, intensidade leve/picante).
- [ ] Camada de repositório fina para a app consumir (Regra de Ouro #3).

## Passos de inicialização (quando as strings existirem)

```bash
cd fd/server

# 1. Instalar Prisma
npm i -D prisma
npm i @prisma/client

# 2. Se ainda não houver schema, inicializar (cria prisma/schema.prisma + .env)
npx prisma init

# 3. Preencher server/.env com DATABASE_URL e DIRECT_URL (ver acima)
#    e escrever prisma/schema.prisma (modelo em architecture.md)

# 4. Configurar o datasource no schema.prisma:
#    datasource db {
#      provider  = "postgresql"
#      url       = env("DATABASE_URL")   // pooled, runtime
#      directUrl = env("DIRECT_URL")     // direta, migrations
#    }

# 5. Criar as tabelas na Supabase (usa DIRECT_URL)
npx prisma migrate dev --name init

# 6. Gerar o client (normalmente automático após migrate)
npx prisma generate

# 7. Correr o seed (banco de prompts)
#    package.json:  "prisma": { "seed": "node prisma/seed.js" }
npx prisma db seed

# 8. Inspecionar dados (opcional)
npx prisma studio
```

## Verificação

- `npx prisma migrate status` → migrations aplicadas.
- No dashboard Supabase → **Table Editor** → ver `game_types`, `prompts`, etc.
- `npx prisma studio` → confirmar que os prompts foram semeados.
- App: um handler de teste que lê `prompts` da BD retorna linhas.

## Notas & armadilhas

- **Pooled vs direta:** migrations com a pooled (6543) falham/avisam — usar
  `directUrl` na 5432 para migrations é o que evita isso.
- **`pgbouncer=true`** na `DATABASE_URL` é necessário no modo transaction pooler.
- **Seed idempotente:** usar `upsert` por `key`/texto para poder correr o seed
  várias vezes sem duplicar prompts.
- **Segurança:** nunca commitar `.env`; partilhar credenciais por canal seguro,
  não pelo repo. O `service_role` key da Supabase (se usado) é secreto.
- **Provedor alternativo:** Neon ou Railway servem igual (Postgres gerido). Só
  muda a origem das connection strings; o resto do fluxo Prisma é o mesmo.

## Estado

- [x] Prisma instalado no `server` (`prisma` + `@prisma/client` v5.22)
- [x] `schema.prisma` escrito, validado, `prisma generate` OK (client gerado)
- [x] `prisma/seed.js` escrito (idempotente, ~22 prompts × 4 tipos)
- [x] Scripts npm: `db:migrate`, `db:seed`, `db:studio`, `db:generate`, `db:reset`
- [ ] **Projeto Supabase criado** ← FALTA (precisa de ti/colega)
- [ ] **Connection strings em `server/.env`** ← FALTA (DATABASE_URL + DIRECT_URL)
- [ ] `migrate dev` corrido (tabelas criadas) — bloqueado pelas strings
- [ ] `seed` corrido (prompts carregados) — bloqueado pelas strings
- [ ] Camada de repositório a ler da BD (integração Semana 3)
