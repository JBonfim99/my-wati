-- Definições de campos extra voltam a ser por tenant (único por tenant + key).

begin;

alter table public.contact_custom_field_definitions
  add column if not exists tenant_id bigint references public.tenants(id) on delete cascade;

-- Índice só em `key` impede clonar a mesma key para vários tenants
drop index if exists ccfdef_key_unique;

do $$
begin
  if exists (
    select 1 from public.contact_custom_field_definitions where tenant_id is null limit 1
  ) then
    if not exists (select 1 from public.tenants limit 1) then
      raise exception
        'contact_custom_field_definitions sem tenant_id: crie um tenant antes de aplicar esta migração.';
    end if;

    insert into public.contact_custom_field_definitions (
      tenant_id,
      key,
      label,
      field_type,
      config,
      default_value,
      sort_order,
      created_at
    )
    select
      t.id,
      d.key,
      d.label,
      d.field_type,
      d.config,
      d.default_value,
      d.sort_order,
      d.created_at
    from public.tenants t
    cross join public.contact_custom_field_definitions d
    where d.tenant_id is null;

    update public.contact_custom_values cv
    set field_id = d_new.id
    from public.contacts c
    join public.contact_custom_field_definitions d_old
      on d_old.id = cv.field_id
      and d_old.tenant_id is null
    join public.contact_custom_field_definitions d_new
      on d_new.tenant_id = c.tenant_id
      and d_new.key = d_old.key
    where cv.contact_id = c.id;

    delete from public.contact_custom_field_definitions where tenant_id is null;
  end if;
end $$;

alter table public.contact_custom_field_definitions
  alter column tenant_id set not null;

create unique index if not exists ccfdef_tenant_key
  on public.contact_custom_field_definitions (tenant_id, key);

drop policy if exists ccfdef_global_select on public.contact_custom_field_definitions;
drop policy if exists ccfdef_global_write on public.contact_custom_field_definitions;
drop policy if exists ccfdef_tenant on public.contact_custom_field_definitions;

create policy ccfdef_tenant on public.contact_custom_field_definitions
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

commit;
