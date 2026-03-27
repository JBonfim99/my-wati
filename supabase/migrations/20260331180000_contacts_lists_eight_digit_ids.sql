-- Contatos e listas: PK bigint 8 dígitos (10000000–99999999), não sequenciais.
-- Atribuição em migração via aleatoriedade; DEFAULT em novas linhas.

begin;

drop policy if exists contacts_tenant on public.contacts;
drop policy if exists contact_lists_tenant on public.contact_lists;
drop policy if exists contact_list_members_rw on public.contact_list_members;
drop policy if exists contact_tags_rw on public.contact_tags;
drop policy if exists ccv_rw on public.contact_custom_values;

do $$
declare
  r record;
begin
  for r in
    select c.conname, n.nspname as sch, t.relname as tbl
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where c.contype = 'f'
      and c.confrelid in (
        'public.contacts'::regclass,
        'public.contact_lists'::regclass
      )
  loop
    execute format(
      'alter table %I.%I drop constraint if exists %I',
      r.sch,
      r.tbl,
      r.conname
    );
  end loop;
end $$;

alter table public.contact_list_members drop constraint if exists contact_list_members_pkey;
alter table public.contact_tags drop constraint if exists contact_tags_pkey;
alter table public.contact_custom_values drop constraint if exists contact_custom_values_pkey;

alter table public.contacts rename column id to id_old_uuid;
alter table public.contacts add column id bigint;

alter table public.contact_lists rename column id to id_old_uuid;
alter table public.contact_lists add column id bigint;

do $$
declare
  r record;
  new_id bigint;
begin
  for r in select id_old_uuid from public.contacts order by random() loop
    loop
      new_id := (10000000 + floor(random() * 90000000))::bigint;
      exit when not exists (select 1 from public.contacts c where c.id = new_id);
    end loop;
    update public.contacts set id = new_id where id_old_uuid = r.id_old_uuid;
  end loop;
end $$;

do $$
declare
  r record;
  new_id bigint;
begin
  for r in select id_old_uuid from public.contact_lists order by random() loop
    loop
      new_id := (10000000 + floor(random() * 90000000))::bigint;
      exit when not exists (select 1 from public.contact_lists cl where cl.id = new_id);
    end loop;
    update public.contact_lists set id = new_id where id_old_uuid = r.id_old_uuid;
  end loop;
end $$;

alter table public.contact_tags add column contact_id_new bigint;
update public.contact_tags ct
set contact_id_new = c.id
from public.contacts c
where ct.contact_id = c.id_old_uuid;

alter table public.contact_custom_values add column contact_id_new bigint;
update public.contact_custom_values cv
set contact_id_new = c.id
from public.contacts c
where cv.contact_id = c.id_old_uuid;

alter table public.contact_list_members add column list_id_new bigint;
alter table public.contact_list_members add column contact_id_new bigint;
update public.contact_list_members clm
set list_id_new = cl.id,
    contact_id_new = c.id
from public.contact_lists cl,
     public.contacts c
where clm.list_id = cl.id_old_uuid
  and clm.contact_id = c.id_old_uuid;

alter table public.campaigns add column list_id_new bigint;
update public.campaigns ca
set list_id_new = cl.id
from public.contact_lists cl
where ca.list_id is not null
  and ca.list_id = cl.id_old_uuid;

alter table public.campaign_recipients add column contact_id_new bigint;
update public.campaign_recipients cr
set contact_id_new = c.id
from public.contacts c
where cr.contact_id is not null
  and cr.contact_id = c.id_old_uuid;

alter table public.contact_tags drop column contact_id;
alter table public.contact_tags rename column contact_id_new to contact_id;
alter table public.contact_tags alter column contact_id set not null;

alter table public.contact_custom_values drop column contact_id;
alter table public.contact_custom_values rename column contact_id_new to contact_id;
alter table public.contact_custom_values alter column contact_id set not null;

alter table public.contact_list_members drop column list_id;
alter table public.contact_list_members drop column contact_id;
alter table public.contact_list_members rename column list_id_new to list_id;
alter table public.contact_list_members rename column contact_id_new to contact_id;
alter table public.contact_list_members alter column list_id set not null;
alter table public.contact_list_members alter column contact_id set not null;

alter table public.campaigns drop column list_id;
alter table public.campaigns rename column list_id_new to list_id;

alter table public.campaign_recipients drop column contact_id;
alter table public.campaign_recipients rename column contact_id_new to contact_id;

alter table public.contacts drop column id_old_uuid;
alter table public.contacts alter column id set not null;
alter table public.contacts add constraint contacts_pkey primary key (id);
alter table public.contacts
  add constraint contacts_id_eight_digit check (id >= 10000000 and id <= 99999999);

alter table public.contact_lists drop column id_old_uuid;
alter table public.contact_lists alter column id set not null;
alter table public.contact_lists add constraint contact_lists_pkey primary key (id);
alter table public.contact_lists
  add constraint contact_lists_id_eight_digit check (id >= 10000000 and id <= 99999999);

alter table public.contact_list_members
  add constraint contact_list_members_pkey primary key (list_id, contact_id);

create or replace function public.next_eight_digit_contacts_id() returns bigint
language plpgsql volatile as $$
declare
  v bigint;
begin
  loop
    v := (10000000 + floor(random() * 90000000))::bigint;
    exit when not exists (select 1 from public.contacts where id = v);
  end loop;
  return v;
end;
$$;

create or replace function public.next_eight_digit_contact_lists_id() returns bigint
language plpgsql volatile as $$
declare
  v bigint;
begin
  loop
    v := (10000000 + floor(random() * 90000000))::bigint;
    exit when not exists (select 1 from public.contact_lists where id = v);
  end loop;
  return v;
end;
$$;

alter table public.contacts alter column id set default next_eight_digit_contacts_id();
alter table public.contact_lists alter column id set default next_eight_digit_contact_lists_id();

alter table public.contact_tags
  add constraint contact_tags_pkey primary key (contact_id, tag_id);

alter table public.contact_custom_values
  add constraint contact_custom_values_pkey primary key (contact_id, field_id);

alter table public.contact_tags
  add constraint contact_tags_contact_id_contacts_id_fk
  foreign key (contact_id) references public.contacts (id) on delete cascade;

-- FKs tag_id → tags e field_id → definitions não foram removidas pelo bloco acima; mantêm-se.

alter table public.contact_custom_values
  add constraint contact_custom_values_contact_id_contacts_id_fk
  foreign key (contact_id) references public.contacts (id) on delete cascade;

alter table public.contact_list_members
  add constraint contact_list_members_list_id_contact_lists_id_fk
  foreign key (list_id) references public.contact_lists (id) on delete cascade;

alter table public.contact_list_members
  add constraint contact_list_members_contact_id_contacts_id_fk
  foreign key (contact_id) references public.contacts (id) on delete cascade;

alter table public.campaigns
  add constraint campaigns_list_id_contact_lists_id_fk
  foreign key (list_id) references public.contact_lists (id) on delete set null;

alter table public.campaign_recipients
  add constraint campaign_recipients_contact_id_contacts_id_fk
  foreign key (contact_id) references public.contacts (id) on delete set null;

create index if not exists contact_tags_tag_idx on public.contact_tags using btree (tag_id);
create index if not exists clm_contact_idx on public.contact_list_members using btree (contact_id);
create index if not exists ccv_field_idx on public.contact_custom_values using btree (field_id);

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
