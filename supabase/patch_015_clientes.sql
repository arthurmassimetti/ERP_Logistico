-- ============================================================================
-- PATCH 015 — Cadastro de clientes (CNPJ, prazo de pagamento, contato).
--
-- Hoje "transportadora" em fretes é texto livre: "Rochapan", "ROCHAPAN" e
-- "Rochapan " viram 3 clientes diferentes no agrupamento de contas a
-- receber, e não existe CNPJ nem prazo de pagamento acordado em lugar
-- nenhum. Mesmo espírito do patch_007 (categorias_carga): tabela de
-- verdade, nunca excluída — só ativada/desativada.
--
-- fretes.transportadora É MANTIDA (nada quebra nas telas que já leem esse
-- texto direto — fretes.js, relatorios.js, motoristas.js, painelfinanceiro.js,
-- motorista-app.js). O que muda: o formulário de frete passa a ESCOLHER um
-- cliente cadastrado (em vez de digitar), e grava os dois — cliente_id (novo,
-- estruturado) e transportadora (texto, sincronizado com o nome do cliente,
-- pra ninguém mais divergir por causa de maiúscula/espaço). Fretes antigos
-- ganham cliente_id retroativo por aproximação de texto (nome igual
-- ignorando maiúscula/minúscula e espaço nas pontas).
--
-- Seguro rodar mais de uma vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) CLIENTES
-- ---------------------------------------------------------------------------
create table if not exists public.clientes (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null,
  cnpj                  text,
  prazo_pagamento_dias  integer,
  contato_nome          text,
  contato_telefone      text,
  contato_email         text,
  ativo                 boolean not null default true,
  criado_em             timestamptz not null default now()
);

-- impede duplicar cliente só por causa de maiúscula/minúscula ("Rochapan" x "ROCHAPAN")
create unique index if not exists idx_clientes_nome_unico on public.clientes (upper(nome));

alter table public.clientes enable row level security;

-- admin+operacional gerenciam (mesma regra de categorias_carga); financeiro só lê
-- (usa CNPJ/prazo pra conferir recebíveis)
drop policy if exists "adminop_gerencia_clientes" on public.clientes;
create policy "adminop_gerencia_clientes" on public.clientes for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));

drop policy if exists "financeiro_le_clientes" on public.clientes;
create policy "financeiro_le_clientes" on public.clientes for select
  using (public.meu_papel() = 'financeiro');

grant select, insert, update, delete on public.clientes to authenticated;
grant all privileges on public.clientes to service_role;

-- ---------------------------------------------------------------------------
-- 2) BACKFILL — 1 cliente por nome distinto já usado em fretes.transportadora
--    (agrupando por maiúscula/minúscula, mantendo a grafia mais comum)
-- ---------------------------------------------------------------------------
with normalizados as (
  select distinct on (upper(trim(transportadora))) trim(transportadora) as nome
  from public.fretes
  where transportadora is not null and trim(transportadora) <> ''
  order by upper(trim(transportadora)), trim(transportadora)
)
insert into public.clientes (nome)
select nome from normalizados
on conflict (upper(nome)) do nothing;

-- ---------------------------------------------------------------------------
-- 3) FRETES — cliente_id novo, ligado por aproximação de texto aos já existentes
-- ---------------------------------------------------------------------------
alter table public.fretes add column if not exists cliente_id uuid references public.clientes(id);
create index if not exists idx_fretes_cliente on public.fretes(cliente_id);

update public.fretes f
set cliente_id = c.id
from public.clientes c
where f.cliente_id is null
  and f.transportadora is not null
  and upper(trim(f.transportadora)) = upper(c.nome);

-- ---------------------------------------------------------------------------
-- 4) VIEWS — preferem o nome cadastrado do cliente; caem pro texto livre só
--    pra fretes antigos que não bateram no backfill (ex.: transportadora
--    vazia desde sempre)
-- ---------------------------------------------------------------------------
-- "create or replace view" só aceita ADICIONAR coluna no final da lista — não dá
-- pra inserir cliente_id no meio sem mudar a posição de frete_id/data/etc (dá o
-- erro 42P16). Por isso cliente_id vai depois de todas as colunas que já existiam.
create or replace view public.vw_contas_receber
with (security_invoker = true) as
select
  coalesce(c.nome, f.transportadora) as empresa,
  f.id              as frete_id,
  f.data,
  f.valor_frete,
  f.adiantamento,
  coalesce(f.saldo, f.valor_frete - coalesce(f.adiantamento,0)) as valor_pendente,
  f.pagamento_previsto,
  f.pagamento_realizado,
  f.cliente_id
from public.fretes f
left join public.clientes c on c.id = f.cliente_id
where f.pagamento_realizado is null
  and coalesce(f.saldo, f.valor_frete - coalesce(f.adiantamento,0)) > 0;

-- ============================================================================
-- FIM — depois de rodar, confira: 1) "select nome from clientes order by nome"
-- traz 1 linha por transportadora distinta que já existia (sem duplicar por
-- maiúscula); 2) "select count(*) from fretes where transportadora is not
-- null and cliente_id is null" deve vir 0 (todo frete com transportadora
-- preenchida ganhou o vínculo); 3) Contas a Receber continua agrupando do
-- mesmo jeito de antes (mesmos nomes, mesmos totais).
-- ============================================================================
