-- Tags, etiquetas em contactos e campos personalizados (RLS por tenant)

alter table tags enable row level security;
create policy tags_tenant on tags
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

alter table contact_tags enable row level security;
create policy contact_tags_rw on contact_tags
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

alter table contact_custom_field_definitions enable row level security;
create policy ccfdef_tenant on contact_custom_field_definitions
  for all using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

alter table contact_custom_values enable row level security;
create policy ccv_rw on contact_custom_values
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
