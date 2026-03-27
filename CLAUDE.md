# my-wati — Spec & Architecture Reference

> Este arquivo é carregado automaticamente em todos os chats do Claude Code.
> Leia-o integralmente antes de qualquer tarefa. Não ignore nenhuma seção.

---

## 1. O que é este projeto

SaaS multi-tenant para disparo de campanhas WhatsApp via Meta Cloud API.
Stack: **Next.js 15 App Router · React 19 · Drizzle ORM · postgres.js · Supabase Auth · BullMQ · Redis · Tailwind CSS v4 · next-intl · Zod v4**.
Deploy: container Docker standalone (`output: "standalone"`).

---

## 2. Estrutura de pastas

```
src/
  app/
    [locale]/
      [tenantId]/
        (app)/          ← páginas da aplicação (RSC por padrão)
          contacts/
            _components/  ← componentes client específicos da rota
            page.tsx      ← async RSC: busca dados, passa como props
          campaigns/new/
            _components/
            page.tsx
          ...
      (auth)/           ← páginas de login/auth
    api/
      t/[tenantId]/     ← todas as API Routes ficam aqui
      webhooks/
  components/           ← componentes reutilizáveis entre rotas
    contacts/
      ContactFormModal.tsx
  lib/
    contacts/
      queries.ts        ← todas as queries de contacts (paginação, ponto)
      dto.ts            ← serialização + cursor codec
      slug.ts
      validate-custom-value.ts
    db/
      index.ts          ← singleton getDb()
      schema.ts         ← schema Drizzle completo
    queues/
      campaign-queue.ts ← singleton getCampaignQueue() + getRedis()
    api-tenant-context.ts  ← requireTenantContext() para API Routes
    crypto.ts           ← AES-256-GCM com key cache
    rbac.ts             ← funções de permissão
    session.ts          ← getCachedTenantSession() para RSC/layouts
  middleware.ts
  worker/
    index.ts            ← processo BullMQ separado
```

---

## 3. Banco de dados

### Driver e ORM
- **postgres.js** como driver; **Drizzle ORM** como query builder.
- Conexão criada **uma única vez** via singleton `getDb()` em `src/lib/db/index.ts`.
- `prepare: false` é obrigatório (Supabase não suporta prepared statements via pooler).
- Pool máximo: 15 conexões.

### Regra absoluta: multi-tenant isolation
O banco usa **service role** (bypassa RLS). Isso significa que **todo query deve incluir `eq(tabela.tenantId, ctx.tenantId)`**. Nunca faça queries sem filtro de tenant. A segurança multi-tenant é 100% responsabilidade do código da aplicação.

### Schema relevante (tipos e enums)
```
tenants            id: bigint PK
tenantMemberships  tenantId: bigint · userId: uuid · role: membership_role
tenantIntegrations tenantId: bigint · encryptedAccessToken: text
contacts           id: uuid · tenantId: bigint · phoneE164 · name · email
contactTags        contactId · tagId (many-to-many)
contactCustomFieldDefinitions  id · tenantId · key · label · fieldType · defaultValue
contactCustomValues            contactId · fieldId · value: jsonb
tags               id · tenantId · name · slug
contactLists       id · tenantId · name
contactListMembers listId · contactId
campaigns          id · tenantId · status: campaign_status · listId · templateName
campaignRecipients id · campaignId · tenantId · wamid · status: recipient_status
profiles           id (= auth.users.id) · email · displayName

membershipRoleEnum:  admin | editor | support
campaignStatusEnum:  draft | queued | sending | completed | failed
recipientStatusEnum: pending | queued | sending | sent | delivered | read | failed
contactFieldTypeEnum: text | number | boolean | date | select
```

### tenantId é bigint, não UUID
`tenantId` é sempre `number` no TypeScript. Use `parseTenantIdFromParam(param)` de `@/lib/session` para converter o segmento de URL. Nunca faça `Number(param)` diretamente — a função valida inteiros positivos seguros.

---

## 4. Autenticação e contexto de sessão

### Em API Routes
```ts
import { requireTenantContext } from "@/lib/api-tenant-context";

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response; // 400 | 401 | 403
  const ctx = gate.ctx; // { userId, email, tenantId: number, role }
  // ...
}
```
Sempre retorne `gate.response` imediatamente se `!gate.ok`. Nunca continue sem validar.

### Em páginas RSC (Server Components)
```ts
import { getCachedTenantSession, parseTenantIdFromParam } from "@/lib/session";

export default async function MyPage({ params }) {
  const { tenantId: tp } = await params;
  const tenantId = parseTenantIdFromParam(tp);
  if (tenantId === null) redirect("/select-tenant");

  const ctx = await getCachedTenantSession(tenantId);
  if (!ctx) redirect("/select-tenant");
  // ctx.role, ctx.tenantId, ctx.userId disponíveis
}
```
`getCachedTenantSession` usa `React.cache()` — deduplicado por request. Não chame `getSessionContextForTenant` diretamente nas páginas.

---

## 5. Padrão de páginas: RSC + Client Component

### Regra
**Páginas são async Server Components.** Elas buscam dados diretamente no DB (nunca via fetch para suas próprias APIs) e passam como props para um Client Component `*PageClient` ou `*Form`.

```
page.tsx (async RSC)
  └── busca dados: Promise.all([query1, query2, query3])
  └── serializa (serializeContact, etc.)
  └── renderiza <XyzPageClient initialData={...} />

XyzPageClient.tsx ("use client")
  └── recebe initial data como props
  └── gerencia estado local (useState)
  └── faz fetch apenas para mutações (POST/PATCH/DELETE)
  └── atualiza estado local após mutações — NÃO refaz fetch da lista inteira
```

### O que NÃO fazer
- ❌ `useEffect(() => fetch('/api/...'))` para carregar dados iniciais em Client Components
- ❌ Buscar dados em API Route e repassar para o RSC (loop desnecessário)
- ❌ Após criar/editar um item, refazer fetch da lista completa — atualize o estado local com o item retornado

### Exemplo concreto
Ver `src/app/[locale]/[tenantId]/(app)/contacts/page.tsx` (RSC) e `_components/ContactsPageClient.tsx` (client).

---

## 6. API Routes

### Estrutura padrão
```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";
import { getDb } from "@/lib/db";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const createSchema = z.object({ ... });

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  if (!canWriteContacts(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  // ...
}
```

### Regras
1. **Sempre Zod** para validar request body. Nunca `as { campo: tipo }` no body.
2. **RBAC explícito**: chame `canWrite*`, `canManage*`, etc. de `@/lib/rbac` antes de qualquer mutação.
3. **Retorne apenas o recurso afetado**, não a lista completa. POST retorna `{ item }`, PATCH retorna `{ item }` atualizado.
4. **`z.record(z.string(), z.unknown())`** — Zod v4 exige dois argumentos em `z.record()`.
5. **`z.enum()`** aceita array `as const` ou os valores diretamente. Em Zod v4 o segundo argumento de erro é `{ error: "..." }`, não `{ message: "..." }`.

### Paginação de contacts
Cursor-based: `updatedAt DESC, id DESC` com tuple comparison (`lt + or + and`).
Cursor é `base64(JSON({ updatedAt: string, id: string }))`.
Use `listContacts(db, tenantId, { limit, cursor? })` de `@/lib/contacts/queries`.
Retorno: `{ contacts: SerializedContactDto[], nextCursor: string | null }`.

---

## 7. Queries: padrões obrigatórios

### Singleton de conexão
```ts
import { getDb } from "@/lib/db"; // ← sempre assim
const db = getDb();
```
Nunca instancie `drizzle(...)` diretamente fora de `src/lib/db/index.ts`.

### Paralelismo
Queries independentes devem rodar em paralelo:
```ts
// ✅ correto
const [contacts, fieldDefs, allTags] = await Promise.all([
  listContacts(db, tenantId, { limit: 50 }),
  listContactFieldDefs(db, tenantId),
  listAllTags(db, tenantId),
]);

// ❌ errado — waterfall desnecessário
const contacts = await listContacts(...);
const fieldDefs = await listContactFieldDefs(...);
```

### Leitura de item único após mutação
Use `getContactWithDetails(db, tenantId, id)` — nunca recarregue a lista inteira para retornar um item.

### Batch updates no webhook
Para atualizar múltiplos `wamid` com o mesmo status, agrupe por `(status, errorJson)` e use `inArray(table.wamid, wamids)` com `Promise.all`. Nunca faça `db.update` dentro de loop com `await`.

---

## 8. Queries de contacts: camada dedicada

Toda query relacionada a contacts fica em `src/lib/contacts/queries.ts`:
- `listContacts(db, tenantId, opts)` — paginado
- `getContactWithDetails(db, tenantId, contactId)` — ponto (após mutações)
- `listContactFieldDefs(db, tenantId)` — definições de campos customizados
- `listAllTags(db, tenantId)` — todas as tags do tenant

Serialização (Date → string, forma do DTO) fica em `src/lib/contacts/dto.ts`:
- `serializeContact(row: ContactRowDto): SerializedContactDto`
- `encodeCursor(updatedAt, id): string`
- `decodeCursor(raw): { updatedAt, id } | null`

---

## 9. RBAC

Roles: `admin > editor > support` (support é read-only).

| Ação                       | Roles permitidas    |
|----------------------------|---------------------|
| canWriteContacts           | admin, editor       |
| canWriteCampaigns          | admin, editor       |
| canManageMembers           | admin               |
| canManageIntegration       | admin               |
| isReadOnlySupport          | support             |

Nos Client Components, use `role === "support"` para `readOnly`. Esse valor vem do RSC via prop ou da API.

---

## 10. Criptografia

`src/lib/crypto.ts` — AES-256-GCM para o `encryptedAccessToken` da integração Meta.
- Key derivada via `scryptSync` — **cacheada em módulo** (`_cachedKey`). Nunca chame `scryptSync` por operação.
- Use `encryptSecret(plain)` e `decryptSecret(b64)`. Não reimplemente.

---

## 11. Fila BullMQ

```ts
import { getCampaignQueue } from "@/lib/queues/campaign-queue";
const queue = getCampaignQueue(); // singleton
```

- Queue name: `"campaign-send"` (constante `CAMPAIGN_QUEUE_NAME`)
- Job type: `CampaignSendJob { recipientId: string, tenantId: number }`
- 5 tentativas, backoff exponencial de 3s, removeOnComplete: 1000, removeOnFail: 5000
- O worker roda em **processo separado** (`src/worker/index.ts`) via `Dockerfile.worker`

Nunca instancie `Queue` ou `IORedis` diretamente fora de `campaign-queue.ts`.

---

## 12. Internacionalização (next-intl)

- Locale único: `pt-BR`. `localePrefix: "never"` — URLs **não** têm prefixo de locale.
- Textos ficam em `messages/pt-BR.json` (ou similar).
- Em Client Components: `useTranslations("app.contacts")`.
- Em Server Components: `getTranslations("app.contacts")` (async).
- Para navegação: `import { Link, useRouter } from "@/i18n/navigation"` — **nunca** `next/link` ou `next/navigation` diretamente nas páginas de app.

---

## 13. Middleware

O middleware em `src/middleware.ts` faz duas coisas:
1. Refresh do cookie de sessão Supabase (`updateSession`)
2. Roteamento i18n (`intlMiddleware`)

**Crítico**: o response da sessão é separado do response intl. Os `Set-Cookie` do `sessionRes` são copiados manualmente para o `intlRes`. Não altere essa lógica sem entender a consequência (sessão não renovada = logout inesperado).

Rotas `/api/webhooks/*` pulam autenticação completamente (verificação HMAC própria).
Rotas `/api/*` e `/auth/*` passam apenas pelo `updateSession`.

---

## 14. Componentes: convenções

### Organização
- `src/app/[locale]/[tenantId]/(app)/[rota]/_components/` — componentes específicos da rota (co-location)
- `src/components/` — componentes genuinamente reutilizáveis entre múltiplas rotas

### Nomenclatura
- `XyzPageClient.tsx` — orchestrador client de uma página
- `XyzTable.tsx`, `XyzForm.tsx`, `XyzModal.tsx` — sub-componentes
- `DeleteConfirmDialog.tsx` — dialog genérico reutilizável

### Props de Client Components que recebem dados iniciais
```ts
type Props = {
  tenantId: string;       // sempre string (vem do URL)
  role: string;           // vem do RSC via ctx.role
  initialData: DataDto[]; // prefixo "initial" = dados do RSC
  initialNextCursor: string | null;
};
```

### Atualização local de estado após mutação
```ts
// Após criar um item:
setItems(prev => [novoItem, ...prev]);

// Após editar:
setItems(prev => prev.map(i => i.id === updated.id ? updated : i));

// Após deletar:
setItems(prev => prev.filter(i => i.id !== deletedId));

// NUNCA: await load() / refetch da lista após mutação
```

### onSaved em modais
Callbacks de save recebem o item salvo:
```ts
onSaved: (item: SerializedContactDto) => void
// Não: onSaved: () => void
```
O Client Component que abre o modal atualiza o estado local com o item retornado.

---

## 15. Variáveis de ambiente obrigatórias

| Variável                   | Descrição                                      |
|----------------------------|------------------------------------------------|
| `DATABASE_URL`             | Postgres connection string (service role)      |
| `REDIS_URL`                | Redis connection string                        |
| `APP_ENCRYPTION_KEY`       | Min 16 chars — chave para AES-256-GCM          |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key do Supabase                     |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (opcional — habilita convites)   |
| `NEXT_PUBLIC_SITE_URL`     | URL pública do app (para redirects de auth)    |

---

## 15b. Migrations: Drizzle + Supabase MCP (obrigatório após DDL)

Quando criares ou alterares ficheiros em `drizzle/migrations/` e `schema.ts`, **aplica a migração antes de dar a tarefa como concluída**:

1. **Supabase MCP** (`user-supabase-mywati`): `apply_migration` com `name` em `snake_case` e `query` = conteúdo SQL do ficheiro (DDL). Regista no histórico do projeto Supabase.
2. **Drizzle**: `npx drizzle-kit migrate` com `DATABASE_URL` carregada (ex.: `set -a && . ./.env && set +a`). Atualiza `drizzle.__drizzle_migrations`.

**Armadilha:** se a BD já foi criada com `drizzle-kit push` ou só com migrations Supabase, `drizzle.__drizzle_migrations` pode estar **vazia** — nesse caso `drizzle-kit migrate` tenta `0000_init` e falha (tabelas já existem). Até fazer *baseline* do journal Drizzle, aplica migrações **novas** via MCP `apply_migration` (e mantém o SQL em `drizzle/migrations/` alinhado com o repo).

---

## 16. Anti-patterns proibidos

| ❌ Proibido | ✅ Correto |
|---|---|
| `if (process.env.NODE_ENV !== "production") globalThis.db = ...` | Singleton sempre, todos os ambientes |
| `const db = drizzle(postgres(...))` no topo de um route handler | `const db = getDb()` |
| `new Queue(...)` ou `new IORedis(...)` fora de `campaign-queue.ts` | `getCampaignQueue()` |
| `await db.update(...)` dentro de `for` loop | `Promise.all(grupos.map(...))` |
| `await fetch('/api/...').then(setData)` em `useEffect` para dados iniciais | RSC busca dados e passa como props |
| `await load()` após criar/editar/deletar um item | Atualiza estado local com item retornado |
| `z.record(z.unknown())` (Zod v4) | `z.record(z.string(), z.unknown())` |
| `import { Link } from "next/link"` nas páginas de app | `import { Link } from "@/i18n/navigation"` |
| Query sem filtro `tenantId` | Todo query filtra por `eq(table.tenantId, ctx.tenantId)` |
| `as { campo: tipo }` em request body | `z.object({...}).safeParse(await req.json())` |
| `scryptSync(...)` por chamada de encrypt/decrypt | Key cacheada em módulo (já feito em `crypto.ts`) |
| `let x = valor` quando `x` não é reatribuído | `const x = valor` |
| Retornar lista completa em resposta de POST/PATCH | Retornar apenas `{ item }` criado/atualizado |

---

## 17. Fluxo de uma feature nova (checklist)

1. **Schema**: se precisar de nova tabela/coluna, crie migration em `drizzle/`, atualize `src/lib/db/schema.ts`, e **aplica** com Supabase MCP `apply_migration` + `drizzle-kit migrate` (ver §15b).
2. **Query layer**: se a feature envolve contacts, adicione a query em `src/lib/contacts/queries.ts`. Para outros domínios, crie `src/lib/[dominio]/queries.ts`.
3. **API Route**: em `src/app/api/t/[tenantId]/[recurso]/route.ts`. Siga o padrão: gate → RBAC → Zod → query → retornar item.
4. **RSC Page**: `async function` que chama `getCachedTenantSession`, busca dados em paralelo, passa para Client Component.
5. **Client Component**: estado local, mutações via fetch, atualização local do estado.
6. **Tipos**: DTO de serialização em `dto.ts` se o recurso vai trafegar entre server e client.
7. **`npm run build`** deve passar sem erros antes de considerar a tarefa concluída.
