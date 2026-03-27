-- Tags: PK bigint 8 dígitos (10000000–99999999), não sequenciais.
-- contact_tags.tag_id passa a referenciar tags.id (bigint).

begin;

drop policy if exists tags_tenant on public.tags;
drop policy if exists contact_tags_rw on public.contact_tags;

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
      and c.confrelid = 'public.tags'::regclass
  loop
    execute format(
      'alter table %I.%I drop constraint if exists %I',
      r.sch,
      r.tbl,
      r.conname
    );
  end loop;
end $$;

alter table public.contact_tags drop constraint if exists contact_tags_pkey;

alter table public.tags rename column id to id_old_uuid;
alter table public.tags add column id bigint;

do $$
declare
  r record;
  new_id bigint;
begin
  for r in select id_old_uuid from public.tags order by random() loop
    loop
      new_id := (10000000 + floor(random() * 90000000))::bigint;
      exit when not exists (select 1 from public.tags tg where tg.id = new_id);
    end loop;
    update public.tags set id = new_id where id_old_uuid = r.id_old_uuid;
  end loop;
end $$;

alter table public.contact_tags add column tag_id_new bigint;
update public.contact_tags ct
set tag_id_new = tg.id
from public.tags tg
where ct.tag_id = tg.id_old_uuid;

alter table public.contact_tags drop column tag_id;
alter table public.contact_tags rename column tag_id_new to tag_id;
alter table public.contact_tags alter column tag_id set not null;

alter table public.tags drop constraint tags_pkey;
alter table public.tags drop column id_old_uuid;
alter table public.tags alter column id set not null;
alter table public.tags add constraint tags_pkey primary key (id);
alter table public.tags
  add constraint tags_id_eight_digit check (id >= 10000000 and id <= 99999999);

create or replace function public.next_eight_digit_tags_id() returns bigint
language plpgsql volatile as $$
declare
  v bigint;
begin
  loop
    v := (10000000 + floor(random() * 90000000))::bigint;
    exit when not exists (select 1 from public.tags where id = v);
  end loop;
  return v;
end;
$$;

alter table public.tags alter column id set default next_eight_digit_tags_id();

alter table public.contact_tags
  add constraint contact_tags_pkey primary key (contact_id, tag_id);

-- FK contact_id → contacts já existia antes da migração; só recriamos tag_id → tags.

alter table public.contact_tags
  add constraint contact_tags_tag_id_tags_id_fk
  foreign key (tag_id) references public.tags (id) on delete cascade;

create index if not exists contact_tags_tag_idx on public.contact_tags using btree (tag_id);

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

commit;
