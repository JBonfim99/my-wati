---
name: campo
description: >-
  Define UI, validação e operadores de filtro por tipo de campo personalizado de
  contato (texto, número, data, booleano). Usar sempre que a tarefa envolver
  campo personalizado, filtro por campo customizado, formulário de contato,
  bulk de valores customizados, definições em contactCustomFieldDefinitions ou
  quando o usuário invocar /campo ou “campos personalizados”.
---

# Campos personalizados (contatos)

Antes de implementar ou revisar qualquer fluxo com **campo personalizado**, identificar o **`fieldType`** e seguir **só** a seção desse tipo. Não misturar operadores nem tipos de input entre tipos.

No projeto my-wati, tipos vivem em `FieldType` / `contactCustomFieldDefinitions.fieldType` e operadores permitidos em `src/lib/contacts/filter-operators.ts` (`CUSTOM_FILTER_OPS_BY_TYPE`). Se a especificação abaixo pedir um operador que o código ainda não expõe, alinhar produto ↔ implementação (adicionar op + UI + validação).

## Texto (`text`; `select` comporta-se como texto em filtros)

- **Input:** campo de texto livre — aceita **letras e números** (e demais caracteres usuais de texto, conforme produto).
- **Operadores (rótulos UI):** É · Não é · Contém · Não contém · Está vazio · Não está vazio.
- **Chaves API / filtro (referência):** `eq`, `ne`, `contains`, `not_contains`, `empty`, `not_empty`.

## Número (`number`)

- **Input:** aceita **apenas valores numéricos** (teclado/parsing); rejeitar ou normalizar entradas não numéricas na validação.
- **Operadores (rótulos UI):** Maior que · Menor que · Igual a · Não igual a · Maior ou igual a · Menor ou igual a · Vazio · Não está vazio.
- **Chaves API típicas:** `gt`, `lt`, `eq`, `ne`, `gte`, `lte`, `empty`, `not_empty` (confirmar o que está implementado em `filter-operators` e nas cláusulas em `list-filters` antes de assumir).

## Data (`date`)

- **Input:** **somente data**; usar **seletor de data** (date picker), não texto livre genérico, salvo fallback explícito do produto.
- **Operadores (rótulos UI):** Após · Antes · Na data · Está vazio · Não está vazio.
- **Chaves API / filtro:** `after`, `before`, `on`, `empty`, `not_empty`.

## Booleano (`boolean`)

- **Input:** seletor **Sim** ou **Não** (dois estados claros; não campo de texto).
- **Operadores (rótulos UI):** É · Não é · Está vazio · Não está vazio.
- **Chaves API / filtro (my-wati):** `is_true`, `is_false`, `empty`, `not_empty` — mapear “É/Não é” para verdadeiro/falso conforme o operador escolhido.

## Checklist rápido

1. Qual é o `fieldType`?
2. O controle de entrada corresponde ao tipo (texto vs número vs date picker vs sim/não)?
3. A lista de operadores exibida é **exatamente** a do tipo?
4. Operadores sem valor (`empty` / `not_empty` e equivalentes booleanos) não exigem campo de valor.
5. Validação server-side: `validateAndNormalizeCustomValue` e regras em `validate-custom-value.ts`.

## Quando aplicar

- Filtros na lista de contatos (`cfc`, `ContactsFilterShell`, `list-filters`).
- `ContactFormModal` / valores customizados em PATCH/POST de contato.
- Ações em massa que alteram ou limpam campo personalizado.
- Novos operadores ou tipos em `filter-operators`, `contacts-list-query`, API de listagem.
