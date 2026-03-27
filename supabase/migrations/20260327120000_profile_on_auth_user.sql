-- Cria automaticamente uma linha em public.profiles quando um utilizador é criado em auth.users.
-- Executar no SQL Editor do Supabase após a tabela profiles existir.
-- Opcional: corre o bloco de backfill no fim para utilizadores já criados antes deste trigger.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (
    new.id,
    coalesce(new.email, '')
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email);
  return new;
end;
$$;

-- Remove trigger se re-aplicares o script
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill: utilizadores que já existiam em auth.users sem profile
insert into public.profiles (id, email)
select u.id, coalesce(u.email, '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
