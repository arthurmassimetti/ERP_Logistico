-- ============================================================================
-- PATCH 012 — Kanban de status de entrega na tela de Fretes.
--
-- Adiciona um status de ENTREGA (aguardando coleta / em trânsito / entregue),
-- separado do status de PAGAMENTO que já existia (pago/programado/pendente,
-- calculado em cima de pagamento_previsto/pagamento_realizado). São conceitos
-- independentes: um frete pode estar "entregue" e "pendente" de pagamento ao
-- mesmo tempo.
--
-- Os 438 fretes já lançados até hoje são viagens já concluídas — entram
-- todos como 'entregue' (decisão do dono). O backfill só roda na hora em que
-- a coluna é criada, então rodar este patch de novo não reescreve fretes
-- novos que já tenham mudado de status.
--
-- Também cria fretes_status_historico (log imutável de toda troca de status,
-- alimentado por trigger) e liga a tabela fretes à publicação
-- supabase_realtime, para o Kanban sincronizar entre abas/usuários sem F5.
--
-- Seguro rodar mais de uma vez (types com exception guard, coluna com
-- "if not exists" guardando o backfill, policies recriadas com "drop... if
-- exists" antes, publicação checada via pg_publication_tables).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) STATUS DE ENTREGA — enum + coluna em fretes, com backfill de uma vez só.
-- ---------------------------------------------------------------------------
do $$ begin
  create type status_entrega_frete as enum ('aguardando_coleta', 'em_transito', 'entregue');
exception when duplicate_object then null; end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fretes' and column_name = 'status_entrega'
  ) then
    alter table public.fretes add column status_entrega
      status_entrega_frete not null default 'aguardando_coleta';

    -- backfill: os fretes já existentes são viagens históricas, já concluídas.
    update public.fretes set status_entrega = 'entregue';
  end if;
end $$;

create index if not exists idx_fretes_status_entrega on public.fretes(status_entrega);

-- ---------------------------------------------------------------------------
-- 2) HISTÓRICO — log de toda troca de status, gravado por trigger (não pelo
--    cliente). admin/operacional/financeiro podem LER (mesma visibilidade
--    que já têm em fretes); RLS não tem nenhuma policy de insert/update/
--    delete para "authenticated", então o cliente nunca grava direto — só o
--    trigger (security definer, roda como dono da tabela e por isso ignora
--    RLS) consegue inserir uma linha aqui.
-- ---------------------------------------------------------------------------
create table if not exists public.fretes_status_historico (
  id              uuid primary key default gen_random_uuid(),
  frete_id        uuid not null references public.fretes(id) on delete cascade,
  status_anterior status_entrega_frete,
  status_novo     status_entrega_frete not null,
  alterado_em     timestamptz not null default now(),
  alterado_por    uuid references auth.users(id)
);
create index if not exists idx_fretes_status_historico_frete on public.fretes_status_historico(frete_id);

alter table public.fretes_status_historico enable row level security;

drop policy if exists "adminopfin_le_historico_status_frete" on public.fretes_status_historico;
create policy "adminopfin_le_historico_status_frete" on public.fretes_status_historico for select
  using (public.meu_papel() in ('admin', 'operacional', 'financeiro'));

grant select on public.fretes_status_historico to authenticated;
grant all privileges on public.fretes_status_historico to service_role;

create or replace function public.trg_registrar_status_frete()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    insert into public.fretes_status_historico (frete_id, status_anterior, status_novo, alterado_por)
    values (new.id, null, new.status_entrega, auth.uid());
  elsif tg_op = 'UPDATE' and new.status_entrega is distinct from old.status_entrega then
    insert into public.fretes_status_historico (frete_id, status_anterior, status_novo, alterado_por)
    values (new.id, old.status_entrega, new.status_entrega, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists registrar_status_frete_insert on public.fretes;
create trigger registrar_status_frete_insert
  after insert on public.fretes
  for each row execute function public.trg_registrar_status_frete();

drop trigger if exists registrar_status_frete_update on public.fretes;
create trigger registrar_status_frete_update
  after update on public.fretes
  for each row execute function public.trg_registrar_status_frete();

-- ---------------------------------------------------------------------------
-- 3) REALTIME — liga fretes à publicação padrão do Supabase, para o Kanban
--    refletir mudanças de outras abas/usuários sem precisar recarregar.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fretes'
  ) then
    alter publication supabase_realtime add table public.fretes;
  end if;
end $$;

-- ============================================================================
-- FIM — depois de rodar, confira: 1) fretes ganhou a coluna status_entrega,
-- todos os fretes antigos com valor 'entregue' (fretes_status_historico fica
-- vazio pra eles — o backfill roda antes do trigger existir, de propósito,
-- pra não simular uma troca de status que não aconteceu); 2) criar ou editar
-- um frete pela tela gera 1 linha nova em fretes_status_historico; 3) em
-- Database > Replication, a tabela fretes aparece marcada.
-- ============================================================================
