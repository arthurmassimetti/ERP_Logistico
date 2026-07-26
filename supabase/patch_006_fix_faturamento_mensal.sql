-- ============================================================================
-- PATCH 006 — Corrige vw_faturamento_mensal: diesel aparecia ~10x maior que o
-- real (fan-out de join).
--
-- A view original juntava "fretes" (1 linha por VIAGEM) direto com a
-- subconsulta já agregada de abastecimentos (1 linha por veículo/mês) e só
-- depois somava de novo por fora. Resultado: o total de diesel do mês era
-- multiplicado pela quantidade de fretes daquele veículo no mês (ex.: 15
-- fretes no mês = diesel contado 15x). Comprovado consultando direto:
-- soma real de abastecimentos.valor = R$ 622 mil; a view mostrava R$ 6,2
-- milhões para os mesmos veículos/período.
--
-- Correção: agregar fretes por veículo/mês numa subconsulta própria (1 linha
-- por veículo/mês, igual já era feito para abastecimentos) e só então juntar
-- as duas agregações — sem fan-out.
-- Seguro rodar mais de uma vez.
-- ============================================================================

create or replace view public.vw_faturamento_mensal
with (security_invoker = true) as
select
  f.veiculo_placa,
  f.mes,
  f.frete,
  f.comissao,
  coalesce(a.diesel_mes, 0) as diesel,
  f.frete - f.comissao - coalesce(a.diesel_mes, 0) as saldo
from (
  select veiculo_placa, date_trunc('month', data)::date as mes,
         sum(valor_frete) as frete, sum(comissao) as comissao
  from public.fretes
  group by veiculo_placa, date_trunc('month', data)
) f
left join (
  select veiculo_placa, date_trunc('month', data)::date as mes, sum(valor) as diesel_mes
  from public.abastecimentos
  group by veiculo_placa, date_trunc('month', data)
) a on a.veiculo_placa = f.veiculo_placa and a.mes = f.mes;

-- Reforça o security_invoker (mesmo cuidado do patch_001): sem isso a view pode
-- voltar a aparecer como "Unrestricted" no linter do Supabase.
alter view public.vw_faturamento_mensal set (security_invoker = true);
