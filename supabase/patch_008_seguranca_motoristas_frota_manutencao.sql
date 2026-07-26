-- ============================================================================
-- PATCH 008 — Etapa 1 da v1.0: segurança de checklist, cadastro de motorista
-- (CNH/disponibilidade), situação operacional do veículo e área
-- administrativa de manutenção (ordens de manutenção).
--
-- Não mexe na tabela manutencoes (425 registros, R$ 836 mil de histórico) —
-- ela continua sendo o livro-caixa de custo. ordens_manutencao é o fluxo de
-- trabalho novo; ao concluir uma ordem, ela GERA uma linha em manutencoes.
--
-- Seguro rodar mais de uma vez (colunas com "if not exists", políticas
-- recriadas com "drop policy if exists antes").
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) CHECKLISTS — motorista só lê e cria os próprios; nunca edita nem apaga.
--    A policy antiga era "for all" (incluía update/delete), o que permitia
--    o motorista alterar ou apagar um checklist já enviado — quebra a
--    rastreabilidade (motorista_id + criado_em precisam ser prova imutável).
--    admin/operacional continuam com acesso total, pra correção administrativa.
-- ---------------------------------------------------------------------------
drop policy if exists "motorista_gerencia_proprio_checklist" on public.checklists;

drop policy if exists "motorista_le_proprio_checklist" on public.checklists;
create policy "motorista_le_proprio_checklist" on public.checklists for select
  using (motorista_id = public.meu_motorista_id());

drop policy if exists "motorista_cria_proprio_checklist" on public.checklists;
create policy "motorista_cria_proprio_checklist" on public.checklists for insert
  with check (motorista_id = public.meu_motorista_id());

-- ---------------------------------------------------------------------------
-- 2) MOTORISTAS — documentos (categoria/validade da CNH) e disponibilidade.
--    "ativo" (cadastro ligado/desligado) não muda de significado — disponi-
--    bilidade é um campo operacional novo, independente dele.
-- ---------------------------------------------------------------------------
alter table public.motoristas add column if not exists cnh_categoria text;
alter table public.motoristas add column if not exists cnh_validade date;

do $$ begin
  create type disponibilidade_motorista as enum ('disponivel', 'em_viagem', 'afastado', 'inativo');
exception when duplicate_object then null; end $$;

alter table public.motoristas add column if not exists disponibilidade
  disponibilidade_motorista not null default 'disponivel';

-- ---------------------------------------------------------------------------
-- 3) VEÍCULOS — situação operacional, separada de "ativo" de propósito.
--    "ativo" continua significando só "está cadastrado/em uso no sistema".
--    Reaproveitar "ativo" pra bloqueio faria o veículo sumir da tela de
--    Frota, dos alertas e dos relatórios (todos filtram por ativo=true).
-- ---------------------------------------------------------------------------
do $$ begin
  create type situacao_veiculo as enum ('disponivel', 'em_manutencao', 'bloqueado', 'inativo');
exception when duplicate_object then null; end $$;

alter table public.veiculos add column if not exists situacao
  situacao_veiculo not null default 'disponivel';
alter table public.veiculos add column if not exists situacao_motivo text;
alter table public.veiculos add column if not exists situacao_em timestamptz;
alter table public.veiculos add column if not exists situacao_por uuid references auth.users(id);

-- registra automaticamente quem mudou e quando — não depende de nenhuma tela
-- lembrar de enviar esses dois campos, então nunca fica sem essa auditoria.
create or replace function public.trg_registrar_situacao_veiculo()
returns trigger language plpgsql as $$
begin
  if new.situacao is distinct from old.situacao then
    new.situacao_em := now();
    new.situacao_por := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists registrar_situacao_veiculo on public.veiculos;
create trigger registrar_situacao_veiculo
  before update on public.veiculos
  for each row execute function public.trg_registrar_situacao_veiculo();

-- ---------------------------------------------------------------------------
-- 4) PERFIS — um motorista não pode ter dois logins (e um login não pode
--    ficar amarrado a dois motoristas ao mesmo tempo, isso já era garantido
--    por user_id ser chave primária). Conferido antes de aplicar: nenhum
--    motorista_id duplicado hoje, constraint é segura.
-- ---------------------------------------------------------------------------
alter table public.perfis drop constraint if exists perfis_motorista_id_unico;
alter table public.perfis add constraint perfis_motorista_id_unico unique (motorista_id);

-- ---------------------------------------------------------------------------
-- 5) ORDENS DE MANUTENÇÃO — fluxo de trabalho da oficina. Referencia veículo
--    por placa (veiculos não tem outro identificador estável: placa é a
--    própria chave primária), mesmo padrão de abastecimentos/manutencoes/fretes.
-- ---------------------------------------------------------------------------
do $$ begin
  create type tipo_ordem_manutencao as enum ('preventiva', 'corretiva');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_ordem_manutencao as enum ('aberta', 'em_andamento', 'concluida', 'cancelada');
exception when duplicate_object then null; end $$;

create table if not exists public.ordens_manutencao (
  id                uuid primary key default gen_random_uuid(),
  numero            serial,
  veiculo_placa     text not null references public.veiculos(placa),
  tipo              tipo_ordem_manutencao not null default 'corretiva',
  problema          text not null,
  servico_realizado text,
  responsavel       text,
  oficina           text,
  km                integer,
  valor_pecas       numeric(12,2) not null default 0,
  valor_mao_obra    numeric(12,2) not null default 0,
  valor_total       numeric(12,2) generated always as (coalesce(valor_pecas,0) + coalesce(valor_mao_obra,0)) stored,
  status            status_ordem_manutencao not null default 'aberta',
  aberta_em         timestamptz not null default now(),
  aberta_por        uuid references auth.users(id),
  concluida_em      timestamptz,
  concluida_por     uuid references auth.users(id),
  manutencao_id     uuid references public.manutencoes(id),  -- linha de custo gerada ao concluir
  observacao        text,
  unique (numero)
);
create index if not exists idx_ordens_manutencao_veiculo on public.ordens_manutencao(veiculo_placa);
create index if not exists idx_ordens_manutencao_status on public.ordens_manutencao(status);

alter table public.ordens_manutencao enable row level security;

-- só admin+operacional acessam — motorista não vê ordens, nem leitura
-- (diagnóstico e conclusão são sempre do responsável pela frota/manutenção)
drop policy if exists "adminop_gerencia_ordens_manutencao" on public.ordens_manutencao;
create policy "adminop_gerencia_ordens_manutencao" on public.ordens_manutencao for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));

grant select, insert, update, delete on public.ordens_manutencao to authenticated;
grant all privileges on public.ordens_manutencao to service_role;

-- projeto nunca tinha usado coluna "serial" antes (todo id é uuid) — o grant
-- geral de sequences pra authenticated não existe no schema.sql original,
-- então sem esta linha o insert falha com "permission denied for sequence".
grant usage, select on sequence public.ordens_manutencao_numero_seq to authenticated;

-- ---------------------------------------------------------------------------
-- 6) CONCLUIR ORDEM — transacional: fecha a ordem, gera o custo em
--    manutencoes, e libera o veículo se pedido. Tudo numa função só, então
--    ou tudo acontece ou nada acontece (evita ficar "meio concluído" se o
--    navegador cair no meio de 3 chamadas separadas).
--    SECURITY INVOKER (padrão): admin/operacional já têm CRUD completo nas
--    3 tabelas envolvidas, então não precisa elevar privilégio como no
--    patch_005 — só precisa da atomicidade.
-- ---------------------------------------------------------------------------
create or replace function public.concluir_ordem_manutencao(
  p_ordem_id uuid,
  p_servico_realizado text,
  p_valor_pecas numeric default null,
  p_valor_mao_obra numeric default null,
  p_liberar_veiculo boolean default false
) returns public.ordens_manutencao
language plpgsql as $$
declare
  ordem public.ordens_manutencao;
  nova_manutencao_id uuid;
begin
  select * into ordem from public.ordens_manutencao where id = p_ordem_id for update;

  if ordem.id is null then
    raise exception 'ordem de manutenção não encontrada';
  end if;
  if ordem.status in ('concluida', 'cancelada') then
    raise exception 'ordem já está %, não pode ser concluída de novo', ordem.status;
  end if;

  update public.ordens_manutencao set
    status = 'concluida',
    servico_realizado = coalesce(p_servico_realizado, servico_realizado),
    valor_pecas = coalesce(p_valor_pecas, valor_pecas),
    valor_mao_obra = coalesce(p_valor_mao_obra, valor_mao_obra),
    concluida_em = now(),
    concluida_por = auth.uid()
  where id = p_ordem_id
  returning * into ordem;

  insert into public.manutencoes (veiculo_placa, data, km, servico, valor, oficina, os_nf, categoria)
  values (ordem.veiculo_placa, current_date, ordem.km, ordem.servico_realizado, ordem.valor_total,
          ordem.oficina, 'OM-' || ordem.numero, ordem.tipo::text)
  returning id into nova_manutencao_id;

  update public.ordens_manutencao set manutencao_id = nova_manutencao_id
  where id = p_ordem_id
  returning * into ordem;

  if p_liberar_veiculo then
    update public.veiculos set
      situacao = 'disponivel',
      situacao_motivo = 'Liberado após conclusão da OM #' || ordem.numero
    where placa = ordem.veiculo_placa;
  end if;

  return ordem;
end;
$$;

grant execute on function public.concluir_ordem_manutencao(uuid, text, numeric, numeric, boolean) to authenticated;

-- ============================================================================
-- FIM — depois de rodar, confira: 1) Table Editor mostra ordens_manutencao;
-- 2) motoristas/veiculos ganharam as colunas novas; 3) um insert de teste em
-- ordens_manutencao não dá erro de permissão de sequence.
-- ============================================================================
