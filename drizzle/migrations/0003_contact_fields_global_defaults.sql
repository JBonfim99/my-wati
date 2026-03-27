-- Alinhado a supabase/migrations/20260330100000_contact_fields_global_defaults.sql

begin;

alter table public.contact_custom_field_definitions
  add column if not exists default_value jsonb;

create temporary table _field_canonical on commit drop as
select distinct on (key) id as canonical_id, key
from public.contact_custom_field_definitions
order by key, created_at asc, id asc;

create temporary table _field_map on commit drop as
select d.id as old_id, fc.canonical_id
from public.contact_custom_field_definitions d
join _field_canonical fc on fc.key = d.key;

update public.contact_custom_values cv
set field_id = fm.canonical_id
from _field_map fm
where cv.field_id = fm.old_id
  and fm.old_id <> fm.canonical_id;

delete from public.contact_custom_values cv
where cv.ctid in (
  select x.ctid
  from (
    select
      ctid,
      row_number() over (
        partition by contact_id, field_id
        order by updated_at desc nulls last, ctid
      ) as rn
    from public.contact_custom_values
  ) x
  where x.rn > 1
);

delete from public.contact_custom_field_definitions d
where not exists (
  select 1 from _field_canonical c where c.canonical_id = d.id
);

alter table public.contact_custom_field_definitions
  drop constraint if exists contact_custom_field_definitions_tenant_id_tenants_id_fk;

drop index if exists ccfdef_tenant_key;

create unique index if not exists ccfdef_key_unique
  on public.contact_custom_field_definitions (key);

alter table public.contact_custom_field_definitions
  drop column if exists tenant_id;

drop policy if exists ccfdef_tenant on public.contact_custom_field_definitions;

create policy ccfdef_global_select on public.contact_custom_field_definitions
  for select using (auth.uid() is not null);

create policy ccfdef_global_write on public.contact_custom_field_definitions
  for all using (
    exists (select 1 from public.tenant_memberships m where m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.tenant_memberships m where m.user_id = auth.uid())
  );

commit;
