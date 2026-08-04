# Painel GBP

SaaS de gestão e otimização de Perfil de Empresa no Google, para donos de negócio local e agências.

- [PRD-gbp-dashboard.md](PRD-gbp-dashboard.md) — escopo da V1, riscos das integrações, fases
- [fluxo-ux.md](fluxo-ux.md) — fluxo de experiência do usuário
- [TASKS.md](TASKS.md) — backlog com 11 épicas e critérios de aceite

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Supabase (Auth + Postgres) · Prisma 7 · Tailwind 4

## Começando

```bash
pnpm install
cp .env.example .env    # preencha os valores
pnpm db:generate
pnpm dev
```

O app não sobe sem as variáveis obrigatórias — a validação em `src/lib/env.ts`
falha no boot dizendo exatamente qual está faltando. As integrações que ainda
não têm credencial (Google, SerpApi, DataForSEO, Anthropic, Stripe) estão como
opcionais e passam a ser exigidas conforme cada épica avança.

## Duas conexões com o banco, de propósito

O Supabase expõe caminhos diferentes para o mesmo Postgres, e o projeto usa os
dois:

| Variável | Porta | Quem usa | Por quê |
|---|---|---|---|
| `DATABASE_URL` | 6543 | runtime, via driver adapter em `src/lib/prisma.ts` | transaction pooler; sem ele cada invocação serverless abre conexão nova e esgota o banco |
| `DIRECT_URL` | 5432 | migrations, via `prisma.config.ts` | o pooler de transação não suporta o DDL que o migrate emite |

No Prisma 7 as URLs não ficam mais no `schema.prisma` — o schema só declara o
provider.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | servidor de desenvolvimento (Turbopack) |
| `pnpm build` | build de produção |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | gera o Prisma Client |
| `pnpm db:migrate` | aplica migrations (`migrate deploy`) |
| `pnpm db:studio` | Prisma Studio |

`SKIP_ENV_VALIDATION=1` desliga a validação de env — existe para CI e para
build sem acesso aos segredos, nunca para runtime.

## Estrutura

```
prisma/
  schema.prisma       21 models: multi-tenant, OAuth, série histórica, billing
  migrations/         0_init, 1_defaults, 2_seed
sql/                  os mesmos SQL aplicados manualmente + verificação
src/
  app/                rotas (App Router)
  lib/
    env.ts            validação das variáveis de ambiente
    prisma.ts         client singleton com driver adapter
    supabase/         clients de browser, server e middleware
  middleware.ts       renovação de sessão e proteção de rotas
```

## Estado atual

Fundação (épica E0) instalada e verificada: build, lint, typecheck e conexão de
runtime com o banco. Autenticação, onboarding e os módulos de produto são as
épicas seguintes — ver [TASKS.md](TASKS.md).
