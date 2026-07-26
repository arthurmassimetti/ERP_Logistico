-- ============================================================================
-- PATCH 001 — Corrige as 3 views que apareceram como "Unrestricted"
-- Cole isto no SQL Editor e rode. É seguro rodar mais de uma vez.
-- ============================================================================

-- 1) Faturamento mensal: só quem tem acesso a fretes (admin/financeiro/operacional) enxerga
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

alter view public.vw_faturamento_mensal set (security_invoker = true);

-- 2) Contas a receber: idem — só admin/financeiro/operacional
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

alter view public.vw_contas_receber set (security_invoker = true);

-- 3) Fretes do motorista: agora só retorna as linhas do PRÓPRIO motorista logado
--    (antes retornava as de todo mundo). Continua sem expor valor_frete/saldo.
create or replace view public.vw_fretes_motorista as
select
  f.id, f.data, f.motorista_id, f.veiculo_placa, f.origem, f.destino, f.transportadora,
  f.diaria, f.comissao, f.ciot, f.pagamento_previsto, f.pagamento_realizado, f.observacao
from public.fretes f
where f.motorista_id = public.meu_motorista_id();

-- ============================================================================
-- Depois de rodar: no Table Editor, "vw_faturamento_mensal" e "vw_contas_receber"
-- devem sair de "Unrestricted". "vw_fretes_motorista" pode continuar marcada assim
-- pelo linter do Supabase — é um falso positivo esperado, explicado no comentário
-- da própria view: ela é protegida por um filtro embutido, não por RLS pass-through,
-- porque a tabela fretes não pode dar acesso direto ao motorista (vazaria o valor).
-- ============================================================================
