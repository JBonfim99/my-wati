-- Apply after Drizzle schema exists. Uses auth.uid() from Supabase JWT.
-- Service role (server/worker) bypasses RLS.

create or replace function public.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from tenant_memberships where user_id = auth.uid();
$$;

grant execute on function public.user_tenant_ids() to authenticated;
grant execute on function public.user_tenant_ids() to service_role;

-- Profiles: own row
alter table profiles enable row level security;

create policy profiles_select_own on profiles
  for select using (id = auth.uid());

create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());

create policy profiles_update_own on profiles
  for update using (id = auth.uid());

-- Tenant memberships: see memberships for tenants you belong to; admin can manage same tenant
alter table tenant_memberships enable row level security;

create policy tenant_memberships_select on tenant_memberships
  for select using (
    user_id = auth.uid()
    or tenant_id in (select public.user_tenant_ids())
  );

create policy tenant_memberships_write_admin on tenant_memberships
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

-- Tenants
alter table tenants enable row level security;

create policy tenants_select on tenants
  for select using (id in (select public.user_tenant_ids()));

-- Tenant integrations (Meta credentials)
alter table tenant_integrations enable row level security;

create policy tenant_integrations_select on tenant_integrations
  for select using (tenant_id in (select public.user_tenant_ids()));

create policy tenant_integrations_write_admin on tenant_integrations
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

-- Operational tables: tenant isolation
alter table contacts enable row level security;
create policy contacts_tenant on contacts
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

alter table contact_lists enable row level security;
create policy contact_lists_tenant on contact_lists
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

alter table contact_list_members enable row level security;
create policy contact_list_members_rw on contact_list_members
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

alter table campaigns enable row level security;
create policy campaigns_tenant on campaigns
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

alter table campaign_recipients enable row level security;
create policy campaign_recipients_tenant on campaign_recipients
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));
