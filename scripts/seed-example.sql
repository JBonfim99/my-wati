-- Run in Supabase SQL editor AFTER:
-- 1) drizzle-kit push (or apply generated migration)
-- 2) supabase/migrations/20260327120000_profile_on_auth_user.sql (profile automático em auth.users)
-- 3) User exists in auth.users — o profile deve existir (trigger ou ensureProfile no login)
--
-- Ordem: tenant → membership. user_id = mesmo UUID que em Authentication → Users.
-- tenants.id é bigint (gerado pela sequência após migração).

insert into tenants (name, slug)
values (
  'Minha empresa',
  'minha-empresa'
)
returning id;
-- copy tenant id (número) below as tenant_id:

insert into tenant_memberships (user_id, tenant_id, role)
values (
  'YOUR_USER_UUID'::uuid,
  1,
  'admin'
);
