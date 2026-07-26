-- ============================================================================
-- PHORTE AGUIAR — Schema completo do banco (Supabase / Postgres)
-- Fonte única de verdade: já inclui tabelas, views, funções e as regras de
-- acesso por função de trabalho (admin / operacional / financeiro / motorista).
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".
-- Seguro rodar quantas vezes precisar, em banco vazio ou já criado antes:
-- tabelas/índices usam "IF NOT EXISTS", views/funções usam "OR REPLACE",
-- e cada política de segurança é recriada com "DROP POLICY IF EXISTS" antes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) EXTENSÕES E TIPOS
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gera uuid

do $$ begin
  create type papel_usuario as enum ('admin', 'financeiro', 'operacional', 'motorista');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_veiculo as enum ('cavalo', 'carreta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type origem_conta as enum ('pessoal', 'empresa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type quem_paga as enum ('empresa', 'motorista');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_checklist as enum ('pre_viagem', 'pos_viagem');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 1) PESSOAS: motoristas + perfis (login)
-- ---------------------------------------------------------------------------
create table if not exists public.motoristas (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  cpf          text unique,
  rg           text,
  cnh          text,
  telefone     text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

-- perfis liga cada usuário logado (auth.users) a um papel e, se for motorista, ao registro dele
create table if not exists public.perfis (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  nome         text not null,
  papel        papel_usuario not null default 'operacional',
  motorista_id uuid references public.motoristas(id),
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) FROTA: veículos, abastecimentos, manutenções
-- ---------------------------------------------------------------------------
create table if not exists public.veiculos (
  placa           text primary key,
  tipo            tipo_veiculo not null,
  modelo          text,
  ano_modelo      text,
  cor             text,
  renavam         text,
  chassi          text,
  motor           text,
  crv_numero      text,
  cod_seg_cla     text,
  licenciamento_ano text,
  ipva_status     text,
  multas          numeric(12,2) default 0,
  carreta_placa   text references public.veiculos(placa),
  antt_empresa    text,
  antt_numero     text,
  mct_numero      text,
  mct_status      text,
  tacografo_venc  date,
  tacografo_obs   text,
  km_atual        integer,
  km_troca        integer,
  media_kml       numeric(6,3),
  media_data      date,
  motorista_id    uuid references public.motoristas(id),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

create table if not exists public.abastecimentos (
  id              uuid primary key default gen_random_uuid(),
  veiculo_placa   text not null references public.veiculos(placa),
  data            date not null,
  nota_fiscal     text,
  litros          numeric(10,3),
  valor           numeric(12,2) not null,
  valor_litro     numeric(10,4),
  km_atual        integer,
  km_rodado       integer,
  media_kml       numeric(6,3),
  posto           text,
  vencimento      date,
  valor_vencimento numeric(12,2),
  criado_em       timestamptz not null default now()
);
create index if not exists idx_abastecimentos_veiculo on public.abastecimentos(veiculo_placa);

create table if not exists public.manutencoes (
  id              uuid primary key default gen_random_uuid(),
  veiculo_placa   text not null references public.veiculos(placa),
  data            date not null,
  km              integer,
  servico         text not null,
  valor           numeric(12,2),
  oficina         text,
  os_nf           text,
  categoria       text,               -- ex: motor, carreta, pneus...
  pago_em         date,
  criado_em       timestamptz not null default now()
);
create index if not exists idx_manutencoes_veiculo on public.manutencoes(veiculo_placa);

-- métricas configuráveis: quais indicadores viram controle de frota / bonificação
create table if not exists public.metricas_config (
  id                  uuid primary key default gen_random_uuid(),
  chave               text unique not null,   -- ex: 'media_kml', 'fretes_mes'
  nome                text not null,           -- ex: 'Média km/l'
  alvo_valor          numeric(12,3),
  usada_controle      boolean not null default true,
  usada_bonificacao   boolean not null default false,
  ativa               boolean not null default true
);

-- ---------------------------------------------------------------------------
-- 3) OPERAÇÃO: roteiro e fretes
-- ---------------------------------------------------------------------------
create table if not exists public.roteiro (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  ordem           integer,
  motorista_id    uuid not null references public.motoristas(id),
  origem_uf       text,
  destino_uf      text,
  origem_local    text,
  destino_local   text,
  destino_cidade  text,
  transportadora  text,
  status          text default 'a confirmar',  -- confirmado | a confirmar | em andamento | concluído
  observacao      text,
  criado_em       timestamptz not null default now()
);
create index if not exists idx_roteiro_motorista_data on public.roteiro(motorista_id, data);

create table if not exists public.fretes (
  id                uuid primary key default gen_random_uuid(),
  data              date not null,
  motorista_id      uuid not null references public.motoristas(id),
  veiculo_placa     text references public.veiculos(placa),
  origem            text,
  destino           text,
  transportadora    text,               -- empresa cliente / cobrança
  valor_frete       numeric(12,2) not null,
  adiantamento      numeric(12,2) default 0,
  diaria            numeric(12,2) default 0,   -- diária total recebida do cliente
  diaria_motorista  numeric(12,2) default 0,   -- fatia da diária repassada ao motorista (o resto fica com a empresa)
  saldo             numeric(12,2),      -- o que falta receber deste frete
  comissao          numeric(12,2) not null default 500,   -- R$ 500 fixo por frete (padrão, editável)
  pedagio_valor     numeric(12,2) default 0,
  pedagio_forma     text,               -- ex: 'SEM PARAR', 'R$', 'BOLETO'
  pedagio_pago_por  quem_paga not null default 'empresa',
  ciot              text,
  banco             text,
  pagamento_previsto date,
  pagamento_realizado date,
  observacao        text,
  criado_por        uuid references auth.users(id),
  criado_em         timestamptz not null default now()
);
create index if not exists idx_fretes_motorista on public.fretes(motorista_id);
create index if not exists idx_fretes_veiculo on public.fretes(veiculo_placa);
create index if not exists idx_fretes_data on public.fretes(data);

-- checklist pré/pós-viagem, feito pelo motorista no celular
create table if not exists public.checklists (
  id            uuid primary key default gen_random_uuid(),
  tipo          tipo_checklist not null,
  frete_id      uuid references public.fretes(id),
  motorista_id  uuid not null references public.motoristas(id),
  veiculo_placa text references public.veiculos(placa),
  data          date not null default current_date,
  itens         jsonb not null default '{}'::jsonb,  -- ex: {"pneus": true, "oleo": true, "luzes": false}
  observacao    text,
  criado_em     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4) FINANCEIRO: fixas, a pagar, saldos, vales, folha semanal
-- ---------------------------------------------------------------------------
create table if not exists public.contas_fixas (
  id            uuid primary key default gen_random_uuid(),
  dia_venc      integer not null check (dia_venc between 1 and 31),
  descricao     text not null,
  valor         numeric(12,2) not null,
  recorrencia   text default 'MENSAL',
  origem        origem_conta not null default 'empresa',
  forma_pagto   text,
  data_fim      date,
  ativa         boolean not null default true,
  pendente      boolean not null default false,  -- ex: folha PHORTE só baixa quando confirmado
  observacao    text
);

create table if not exists public.contas_pagar (
  id            uuid primary key default gen_random_uuid(),
  descricao     text not null,
  valor         numeric(12,2) not null,
  vencimento    date not null,
  forma         text,
  categoria     text,
  grupo         text,
  pago_em       date,
  criado_em     timestamptz not null default now()
);

create table if not exists public.saldos_banco (
  id            uuid primary key default gen_random_uuid(),
  banco         text not null unique,
  saldo         numeric(12,2) not null default 0,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.vales (
  id            uuid primary key default gen_random_uuid(),
  motorista_id  uuid not null references public.motoristas(id),
  data          date not null,
  valor         numeric(12,2) not null,
  pago          numeric(12,2) not null default 0,
  saldo         numeric(12,2) generated always as (valor - pago) stored,
  descricao     text,
  criado_em     timestamptz not null default now()
);

-- fechamento semanal (paga aos sábados): 1 linha por motorista por semana
create table if not exists public.folha_semanal (
  id                  uuid primary key default gen_random_uuid(),
  semana_ref          date not null,   -- data do sábado de referência
  motorista_id        uuid not null references public.motoristas(id),
  qtd_fretes          integer not null default 0,
  total_comissoes     numeric(12,2) not null default 0,
  total_diarias       numeric(12,2) not null default 0,
  bonus               numeric(12,2) not null default 0,
  vales_descontados   numeric(12,2) not null default 0,
  total_pago          numeric(12,2) not null default 0,
  pago_em             date,
  status              text not null default 'aberta', -- aberta | fechada | paga
  criado_em           timestamptz not null default now(),
  unique (semana_ref, motorista_id)
);

-- ---------------------------------------------------------------------------
-- 5) FUNÇÕES DE IDENTIDADE — precisam existir antes das views/políticas que as usam
-- ---------------------------------------------------------------------------

create or replace function public.meu_papel()
returns papel_usuario language sql stable security definer as $$
  select papel from public.perfis where user_id = auth.uid();
$$;

create or replace function public.meu_motorista_id()
returns uuid language sql stable security definer as $$
  select motorista_id from public.perfis where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 6) VIEWS E FUNÇÕES CALCULADAS — dados derivados, nunca digitados
-- ---------------------------------------------------------------------------

-- Faturamento por veículo/mês (substitui a planilha FATURAMENTO 2026)
-- security_invoker = true: a view roda com os privilégios de QUEM CONSULTA, não de quem criou.
-- Sem isso, RLS da tabela fretes/abastecimentos seria ignorado e qualquer autenticado veria tudo.
create or replace view public.vw_faturamento_mensal
with (security_invoker = true) as
select
  f.veiculo_placa,
  date_trunc('month', f.data)::date as mes,
  sum(f.valor_frete)                as frete,
  sum(f.comissao)                   as comissao,
  coalesce(sum(a.diesel_mes), 0)    as diesel,
  sum(f.valor_frete) - sum(f.comissao) - coalesce(sum(a.diesel_mes), 0) as saldo
from public.fretes f
left join (
  select veiculo_placa, date_trunc('month', data)::date as mes, sum(valor) as diesel_mes
  from public.abastecimentos
  group by veiculo_placa, date_trunc('month', data)
) a on a.veiculo_placa = f.veiculo_placa and a.mes = date_trunc('month', f.data)::date
group by f.veiculo_placa, date_trunc('month', f.data);

-- Contas a receber automáticas: saldo pendente de cada frete + adiantamentos, por empresa (transportadora)
-- security_invoker = true: idem acima — só admin/financeiro/operacional enxergam (via RLS de fretes).
create or replace view public.vw_contas_receber
with (security_invoker = true) as
select
  f.transportadora as empresa,
  f.id              as frete_id,
  f.data,
  f.valor_frete,
  f.adiantamento,
  coalesce(f.saldo, f.valor_frete - coalesce(f.adiantamento,0)) as valor_pendente,
  f.pagamento_previsto,
  f.pagamento_realizado
from public.fretes f
where f.pagamento_realizado is null
  and coalesce(f.saldo, f.valor_frete - coalesce(f.adiantamento,0)) > 0;

-- Vencimentos dos próximos N dias (contas fixas geradas mês a mês + contas avulsas em aberto)
create or replace function public.gerar_vencimentos(horizonte int default 45)
returns table (
  chave text, data date, descricao text, valor numeric,
  forma text, origem text, fixa boolean
) language plpgsql stable as $$
declare
  m date;
  ultimo_dia int;
  venc date;
  cf record;
begin
  -- mês atual e o seguinte cobrem qualquer horizonte de até ~45 dias
  for m in select generate_series(date_trunc('month', current_date)::date,
                                   date_trunc('month', current_date + (horizonte || ' days')::interval)::date,
                                   interval '1 month')
  loop
    ultimo_dia := extract(day from (m + interval '1 month - 1 day'))::int;
    for cf in select * from public.contas_fixas where ativa loop
      venc := m + (least(cf.dia_venc, ultimo_dia) - 1) * interval '1 day';
      if (cf.data_fim is null or venc <= cf.data_fim)
         and venc between current_date and current_date + horizonte then
        chave := 'fixa-' || cf.id || '-' || to_char(m, 'YYYY-MM');
        data := venc; descricao := cf.descricao; valor := cf.valor;
        forma := cf.forma_pagto; origem := cf.origem::text; fixa := true;
        return next;
      end if;
    end loop;
  end loop;

  for cf in select * from public.contas_pagar
            where pago_em is null
              and vencimento between current_date and current_date + horizonte
  loop
    chave := 'avulsa-' || cf.id;
    data := cf.vencimento; descricao := cf.descricao; valor := cf.valor;
    forma := cf.forma; origem := 'empresa'; fixa := false;
    return next;
  end loop;
end;
$$;

-- Fretes "sem valores sensíveis" — para o portal do motorista (sem valor_frete/saldo).
-- Esta view NÃO usa security_invoker: ela roda com privilégio de dono de propósito,
-- porque a tabela fretes não dá select nenhum ao papel motorista (só vê pela view).
-- A proteção aqui é dupla: (1) as colunas valor_frete/saldo nem aparecem no select,
-- e (2) o "where" abaixo garante que só as linhas do próprio motorista voltam.
-- "diaria" aqui é a FATIA do motorista (diaria_motorista), nunca a diária total recebida
-- da empresa cliente — essa distinção é o mesmo motivo de valor_frete ficar de fora.
create or replace view public.vw_fretes_motorista as
select
  f.id, f.data, f.motorista_id, f.veiculo_placa, f.origem, f.destino, f.transportadora,
  f.diaria_motorista as diaria, f.comissao, f.ciot, f.pagamento_previsto, f.pagamento_realizado, f.observacao
from public.fretes f
where f.motorista_id = public.meu_motorista_id();

-- ---------------------------------------------------------------------------
-- 7) SEGURANÇA (RLS) — cada papel enxerga só o que pode
-- ---------------------------------------------------------------------------

alter table public.motoristas        enable row level security;
alter table public.perfis            enable row level security;
alter table public.veiculos          enable row level security;
alter table public.abastecimentos    enable row level security;
alter table public.manutencoes       enable row level security;
alter table public.metricas_config   enable row level security;
alter table public.roteiro           enable row level security;
alter table public.fretes            enable row level security;
alter table public.checklists        enable row level security;
alter table public.contas_fixas      enable row level security;
alter table public.contas_pagar      enable row level security;
alter table public.saldos_banco      enable row level security;
alter table public.vales             enable row level security;
alter table public.folha_semanal     enable row level security;

-- ---------------------------------------------------------------------------
-- Princípio: cada papel só tem o acesso que a função de trabalho exige.
--   admin       -> tudo, sem exceção (inclusive contas pessoais)
--   operacional -> CRUD completo no "chão de operação" (motoristas, veículos,
--                  fretes, roteiro, abastecimento, manutenção, checklist).
--                  ZERO acesso a dinheiro (nem leitura).
--   financeiro  -> CRUD completo no dinheiro da EMPRESA (contas a pagar,
--                  saldos, vales, folha, contas fixas só origem='empresa').
--                  LEITURA (sem editar) de fretes/motoristas/veículos/
--                  abastecimento, o mínimo pra fechar folha e conferir
--                  recebíveis. ZERO acesso a roteiro/checklist/manutenção
--                  e ZERO acesso às contas fixas PESSOAIS.
--   motorista   -> só o que é dele; nunca fretes crus (valor fica oculto);
--                  nunca nada de financeiro da empresa.
-- ---------------------------------------------------------------------------

-- perfis: cada um vê o próprio; admin vê e gerencia todos
drop policy if exists "perfis_select_proprio_ou_admin" on public.perfis;
create policy "perfis_select_proprio_ou_admin" on public.perfis for select
  using (user_id = auth.uid() or public.meu_papel() = 'admin');
drop policy if exists "perfis_admin_gerencia" on public.perfis;
create policy "perfis_admin_gerencia" on public.perfis for all
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');

-- motoristas: admin+operacional gerenciam; financeiro só lê; motorista só o próprio
drop policy if exists "adminop_gerencia_motoristas" on public.motoristas;
create policy "adminop_gerencia_motoristas" on public.motoristas for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
drop policy if exists "financeiro_le_motoristas" on public.motoristas;
create policy "financeiro_le_motoristas" on public.motoristas for select
  using (public.meu_papel() = 'financeiro');
drop policy if exists "motorista_ve_proprio_cadastro" on public.motoristas;
create policy "motorista_ve_proprio_cadastro" on public.motoristas for select
  using (id = public.meu_motorista_id());

-- veículos: mesma lógica de motoristas
drop policy if exists "adminop_gerencia_veiculos" on public.veiculos;
create policy "adminop_gerencia_veiculos" on public.veiculos for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
drop policy if exists "financeiro_le_veiculos" on public.veiculos;
create policy "financeiro_le_veiculos" on public.veiculos for select
  using (public.meu_papel() = 'financeiro');
drop policy if exists "motorista_ve_seu_veiculo" on public.veiculos;
create policy "motorista_ve_seu_veiculo" on public.veiculos for select
  using (motorista_id = public.meu_motorista_id());

-- abastecimentos: admin+operacional gerenciam; financeiro só lê (entra no cálculo de faturamento);
-- motorista não vê (é custo, não é dado dele)
drop policy if exists "adminop_gerencia_abastecimentos" on public.abastecimentos;
create policy "adminop_gerencia_abastecimentos" on public.abastecimentos for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
drop policy if exists "financeiro_le_abastecimentos" on public.abastecimentos;
create policy "financeiro_le_abastecimentos" on public.abastecimentos for select
  using (public.meu_papel() = 'financeiro');

-- manutenções: só admin+operacional (financeiro não precisa; motorista só vê do seu veículo)
drop policy if exists "adminop_gerencia_manutencoes" on public.manutencoes;
create policy "adminop_gerencia_manutencoes" on public.manutencoes for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
drop policy if exists "motorista_ve_manutencoes_seu_veiculo" on public.manutencoes;
create policy "motorista_ve_manutencoes_seu_veiculo" on public.manutencoes for select
  using (veiculo_placa in (select placa from public.veiculos where motorista_id = public.meu_motorista_id()));

-- métricas de controle/bonificação: só admin configura
drop policy if exists "admin_gerencia_metricas" on public.metricas_config;
create policy "admin_gerencia_metricas" on public.metricas_config for all
  using (public.meu_papel() = 'admin');

-- roteiro: só admin+operacional gerenciam (financeiro não precisa); motorista só o próprio
drop policy if exists "adminop_gerencia_roteiro" on public.roteiro;
create policy "adminop_gerencia_roteiro" on public.roteiro for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
drop policy if exists "motorista_ve_proprio_roteiro" on public.roteiro;
create policy "motorista_ve_proprio_roteiro" on public.roteiro for select
  using (motorista_id = public.meu_motorista_id());

-- fretes: admin+operacional lançam/editam; financeiro só lê (pra conferir recebíveis/folha);
-- motorista NUNCA lê a tabela crua (valor fica oculto) — só pela view vw_fretes_motorista
drop policy if exists "adminop_gerencia_fretes" on public.fretes;
create policy "adminop_gerencia_fretes" on public.fretes for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
drop policy if exists "financeiro_le_fretes" on public.fretes;
create policy "financeiro_le_fretes" on public.fretes for select
  using (public.meu_papel() = 'financeiro');

-- checklists: só admin+operacional administram todos; motorista gerencia só os seus
drop policy if exists "adminop_gerencia_checklists" on public.checklists;
create policy "adminop_gerencia_checklists" on public.checklists for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
drop policy if exists "motorista_gerencia_proprio_checklist" on public.checklists;
create policy "motorista_gerencia_proprio_checklist" on public.checklists for all
  using (motorista_id = public.meu_motorista_id())
  with check (motorista_id = public.meu_motorista_id());

-- contas fixas: admin vê/edita tudo (inclusive pessoal);
-- financeiro só as de origem='empresa' — nunca as pessoais (mesada, condomínio etc.)
drop policy if exists "admin_gerencia_fixas_tudo" on public.contas_fixas;
create policy "admin_gerencia_fixas_tudo" on public.contas_fixas for all
  using (public.meu_papel() = 'admin')
  with check (public.meu_papel() = 'admin');
drop policy if exists "financeiro_gerencia_fixas_empresa" on public.contas_fixas;
create policy "financeiro_gerencia_fixas_empresa" on public.contas_fixas for all
  using (public.meu_papel() = 'financeiro' and origem = 'empresa')
  with check (public.meu_papel() = 'financeiro' and origem = 'empresa');

-- contas a pagar / saldos: dinheiro da empresa, só admin+financeiro
drop policy if exists "financeiro_acesso_total_pagar" on public.contas_pagar;
create policy "financeiro_acesso_total_pagar" on public.contas_pagar for all
  using (public.meu_papel() in ('admin','financeiro'))
  with check (public.meu_papel() in ('admin','financeiro'));

drop policy if exists "financeiro_acesso_total_saldos" on public.saldos_banco;
create policy "financeiro_acesso_total_saldos" on public.saldos_banco for all
  using (public.meu_papel() in ('admin','financeiro'))
  with check (public.meu_papel() in ('admin','financeiro'));

-- vales: admin+financeiro gerenciam; motorista só lê os próprios
drop policy if exists "financeiro_acesso_total_vales" on public.vales;
create policy "financeiro_acesso_total_vales" on public.vales for all
  using (public.meu_papel() in ('admin','financeiro'))
  with check (public.meu_papel() in ('admin','financeiro'));
drop policy if exists "motorista_ve_proprios_vales" on public.vales;
create policy "motorista_ve_proprios_vales" on public.vales for select
  using (motorista_id = public.meu_motorista_id());

-- folha semanal: admin+financeiro fecham/pagam; motorista só lê a própria
drop policy if exists "financeiro_acesso_total_folha" on public.folha_semanal;
create policy "financeiro_acesso_total_folha" on public.folha_semanal for all
  using (public.meu_papel() in ('admin','financeiro'))
  with check (public.meu_papel() in ('admin','financeiro'));
drop policy if exists "motorista_ve_propria_folha" on public.folha_semanal;
create policy "motorista_ve_propria_folha" on public.folha_semanal for select
  using (motorista_id = public.meu_motorista_id());

-- a view do motorista (sem valores sensíveis) é liberada para o papel motorista
grant select on public.vw_fretes_motorista to authenticated;

-- ---------------------------------------------------------------------------
-- 8) PERMISSÕES DE ACESSO (GRANTS)
-- Projetos novos do Supabase vêm "endurecidos": os papéis da API (anon,
-- authenticated, service_role) NÃO ganham mais acesso automático ao schema
-- public. Sem este bloco, qualquer consulta responde
-- "permission denied for schema public" (código 42501).
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

-- service_role = a chave secreta usada pelos scripts locais: acesso total (ignora RLS)
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- authenticated = usuários logados no app: podem operar as tabelas,
-- e o RLS (seção 7) decide linha a linha o que cada papel enxerga.
-- Precisa também de EXECUTE nas funções, porque as políticas chamam
-- meu_papel() / meu_motorista_id() durante cada consulta.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- objetos criados no futuro herdam as mesmas permissões automaticamente
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

-- anon (visitante sem login) fica só com USAGE no schema e nada mais:
-- nenhuma tabela é legível sem login neste sistema.

-- ============================================================================
-- FIM — depois de rodar, confira em "Table Editor" se as tabelas apareceram.
-- ============================================================================
