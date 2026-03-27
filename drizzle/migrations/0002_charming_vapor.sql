-- tenants.id and all tenant_id FKs: uuid -> bigint (stable mapping via row_number)
-- RLS: user_tenant_ids() returns setof bigint

begin;

-- 1) Stable numeric ids for existing tenants
alter table public.tenants add column new_id bigint;

update public.tenants t
set new_id = s.n
from (
  select id, row_number() over (order by created_at, id) as n
  from public.tenants
) s
where t.id = s.id;

alter table public.tenants alter column new_id set not null;

-- 2) Drop FKs to tenants(id)
alter table public.campaign_recipients drop constraint if exists campaign_recipients_tenant_id_tenants_id_fk;
alter table public.campaigns drop constraint if exists campaigns_tenant_id_tenants_id_fk;
alter table public.contact_lists drop constraint if exists contact_lists_tenant_id_tenants_id_fk;
alter table public.contacts drop constraint if exists contacts_tenant_id_tenants_id_fk;
alter table public.tenant_integrations drop constraint if exists tenant_integrations_tenant_id_tenants_id_fk;
alter table public.tenant_memberships drop constraint if exists tenant_memberships_tenant_id_tenants_id_fk;
alter table public.tags drop constraint if exists tags_tenant_id_tenants_id_fk;
alter table public.contact_custom_field_definitions drop constraint if exists contact_custom_field_definitions_tenant_id_tenants_id_fk;

-- 3) tenant_integrations PK is tenant_id (uuid) — remove before column swap
alter table public.tenant_integrations drop constraint if exists tenant_integrations_pkey;

-- 4) New bigint columns on children
alter table public.campaign_recipients add column tenant_id_new bigint;
alter table public.campaigns add column tenant_id_new bigint;
alter table public.contact_lists add column tenant_id_new bigint;
alter table public.contacts add column tenant_id_new bigint;
alter table public.tenant_integrations add column tenant_id_new bigint;
alter table public.tenant_memberships add column tenant_id_new bigint;
alter table public.tags add column tenant_id_new bigint;
alter table public.contact_custom_field_definitions add column tenant_id_new bigint;

-- 5) Backfill from tenants.new_id
update public.campaign_recipients cr
set tenant_id_new = t.new_id
from public.tenants t
where cr.tenant_id = t.id;

update public.campaigns c
set tenant_id_new = t.new_id
from public.tenants t
where c.tenant_id = t.id;

update public.contact_lists cl
set tenant_id_new = t.new_id
from public.tenants t
where cl.tenant_id = t.id;

update public.contacts c
set tenant_id_new = t.new_id
from public.tenants t
where c.tenant_id = t.id;

update public.tenant_integrations ti
set tenant_id_new = t.new_id
from public.tenants t
where ti.tenant_id = t.id;

update public.tenant_memberships tm
set tenant_id_new = t.new_id
from public.tenants t
where tm.tenant_id = t.id;

update public.tags tg
set tenant_id_new = t.new_id
from public.tenants t
where tg.tenant_id = t.id;

update public.contact_custom_field_definitions cfd
set tenant_id_new = t.new_id
from public.tenants t
where cfd.tenant_id = t.id;

alter table public.campaign_recipients alter column tenant_id_new set not null;
alter table public.campaigns alter column tenant_id_new set not null;
alter table public.contact_lists alter column tenant_id_new set not null;
alter table public.contacts alter column tenant_id_new set not null;
alter table public.tenant_integrations alter column tenant_id_new set not null;
alter table public.tenant_memberships alter column tenant_id_new set not null;
alter table public.tags alter column tenant_id_new set not null;
alter table public.contact_custom_field_definitions alter column tenant_id_new set not null;

-- 5b) RLS: políticas e user_tenant_ids referenciam tenant_id — remover antes de dropar colunas uuid
drop policy if exists tenant_memberships_select on public.tenant_memberships;
drop policy if exists tenant_memberships_write_admin on public.tenant_memberships;
drop policy if exists tenants_select on public.tenants;
drop policy if exists tenant_integrations_select on public.tenant_integrations;
drop policy if exists tenant_integrations_write_admin on public.tenant_integrations;
drop policy if exists contacts_tenant on public.contacts;
drop policy if exists contact_lists_tenant on public.contact_lists;
drop policy if exists contact_list_members_rw on public.contact_list_members;
drop policy if exists campaigns_tenant on public.campaigns;
drop policy if exists campaign_recipients_tenant on public.campaign_recipients;
drop policy if exists tags_tenant on public.tags;
drop policy if exists contact_tags_rw on public.contact_tags;
drop policy if exists ccfdef_tenant on public.contact_custom_field_definitions;
drop policy if exists ccv_rw on public.contact_custom_values;

drop function if exists public.user_tenant_ids();

-- 6) Drop uuid tenant_id, rename bigint
alter table public.campaign_recipients drop column tenant_id;
alter table public.campaign_recipients rename column tenant_id_new to tenant_id;

alter table public.campaigns drop column tenant_id;
alter table public.campaigns rename column tenant_id_new to tenant_id;

alter table public.contact_lists drop column tenant_id;
alter table public.contact_lists rename column tenant_id_new to tenant_id;

alter table public.contacts drop column tenant_id;
alter table public.contacts rename column tenant_id_new to tenant_id;

alter table public.tenant_integrations drop column tenant_id;
alter table public.tenant_integrations rename column tenant_id_new to tenant_id;

alter table public.tenant_memberships drop column tenant_id;
alter table public.tenant_memberships rename column tenant_id_new to tenant_id;

alter table public.tags drop column tenant_id;
alter table public.tags rename column tenant_id_new to tenant_id;

alter table public.contact_custom_field_definitions drop column tenant_id;
alter table public.contact_custom_field_definitions rename column tenant_id_new to tenant_id;

-- 7) Swap tenants primary key: uuid -> bigint
alter table public.tenants drop constraint tenants_pkey;
alter table public.tenants rename column id to id_uuid;
alter table public.tenants rename column new_id to id;
alter table public.tenants add primary key (id);

create sequence if not exists public.tenants_id_seq owned by public.tenants.id;
select setval(
  'public.tenants_id_seq',
  coalesce((select max(id) from public.tenants), 1)
);
alter table public.tenants alter column id set default nextval('public.tenants_id_seq');

alter table public.tenants drop column id_uuid;

-- 8) Foreign keys back to tenants(id)
alter table public.campaign_recipients
  add constraint campaign_recipients_tenant_id_tenants_id_fk
  foreign key (tenant_id) references public.tenants (id) on delete cascade;

alter table public.campaigns
  add constraint campaigns_tenant_id_tenants_id_fk
  foreign key (tenant_id) references public.tenants (id) on delete cascade;

alter table public.contact_lists
  add constraint contact_lists_tenant_id_tenants_id_fk
  foreign key (tenant_id) references public.tenants (id) on delete cascade;

alter table public.contacts
  add constraint contacts_tenant_id_tenants_id_fk
  foreign key (tenant_id) references public.tenants (id) on delete cascade;

alter table public.tenant_integrations
  add constraint tenant_integrations_tenant_id_tenants_id_fk
  foreign key (tenant_id) references public.tenants (id) on delete cascade;

alter table public.tenant_memberships
  add constraint tenant_memberships_tenant_id_tenants_id_fk
  foreign key (tenant_id) references public.tenants (id) on delete cascade;

alter table public.tags
  add constraint tags_tenant_id_tenants_id_fk
  foreign key (tenant_id) references public.tenants (id) on delete cascade;

alter table public.contact_custom_field_definitions
  add constraint contact_custom_field_definitions_tenant_id_tenants_id_fk
  foreign key (tenant_id) references public.tenants (id) on delete cascade;

alter table public.tenant_integrations add primary key (tenant_id);

-- 9) RLS: recriar user_tenant_ids (bigint) e políticas
create function public.user_tenant_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from tenant_memberships where user_id = auth.uid();
$$;

grant execute on function public.user_tenant_ids() to authenticated;
grant execute on function public.user_tenant_ids() to service_role;

create policy tenant_memberships_select on public.tenant_memberships
  for select using (
    user_id = auth.uid()
    or tenant_id in (select public.user_tenant_ids())
  );

create policy tenant_memberships_write_admin on public.tenant_memberships
  for all using (
    exists (
      select 1 from tenant_memberships m
      where m.tenant_id = tenant_memberships.tenant_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from tenant_memberships m
      where m.tenant_id = tenant_memberships.tenant_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

create policy tenants_select on public.tenants
  for select using (id in (select public.user_tenant_ids()));

create policy tenant_integrations_select on public.tenant_integrations
  for select using (tenant_id in (select public.user_tenant_ids()));

create policy tenant_integrations_write_admin on public.tenant_integrations
  for all using (
    exists (
      select 1 from tenant_memberships m
      where m.tenant_id = tenant_integrations.tenant_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from tenant_memberships m
      where m.tenant_id = tenant_integrations.tenant_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

create policy contacts_tenant on public.contacts
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

create policy contact_lists_tenant on public.contact_lists
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

create policy contact_list_members_rw on public.contact_list_members
  for all using (
    exists (
      select 1 from contact_lists cl
      where cl.id = contact_list_members.list_id
        and cl.tenant_id in (select public.user_tenant_ids())
    )
  )
  with check (
    exists (
      select 1 from contact_lists cl
      where cl.id = contact_list_members.list_id
        and cl.tenant_id in (select public.user_tenant_ids())
    )
  );

create policy campaigns_tenant on public.campaigns
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

create policy campaign_recipients_tenant on public.campaign_recipients
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

create policy tags_tenant on public.tags
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

create policy contact_tags_rw on public.contact_tags
  for all using (
    exists (
      select 1 from contacts c
      where c.id = contact_tags.contact_id
        and c.tenant_id in (select public.user_tenant_ids())
    )
  )
  with check (
    exists (
      select 1 from contacts c
      where c.id = contact_tags.contact_id
        and c.tenant_id in (select public.user_tenant_ids())
    )
  );

create policy ccfdef_tenant on public.contact_custom_field_definitions
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

create policy ccv_rw on public.contact_custom_values
  for all using (
    exists (
      select 1 from contacts c
      where c.id = contact_custom_values.contact_id
        and c.tenant_id in (select public.user_tenant_ids())
    )
  )
  with check (
    exists (
      select 1 from contacts c
      where c.id = contact_custom_values.contact_id
        and c.tenant_id in (select public.user_tenant_ids())
    )
  );

commit;
