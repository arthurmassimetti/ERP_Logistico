-- ============================================================================
-- PATCH 005 — Permite ao papel "financeiro" confirmar recebimento de frete
-- (tela Contas a Receber) sem dar acesso de escrita total à tabela fretes.
--
-- Hoje "financeiro" só tem SELECT em fretes (de propósito, ver schema.sql
-- seção 7 — financeiro só deveria "conferir recebíveis", não editar frete).
-- A tela nova de Contas a Receber, porém, precisa que financeiro consiga
-- marcar "recebido" e registrar recebimento parcial — sem isso, o botão dá
-- erro de permissão (42501) pra quem loga como financeiro.
--
-- Solução: uma função SECURITY DEFINER que só mexe em 3 colunas
-- (adiantamento, saldo, pagamento_realizado), nunca em valor_frete, origem,
-- destino, motorista etc. admin/operacional continuam podendo editar o
-- frete inteiro pela tela de Fretes, como já era.
-- Seguro rodar mais de uma vez.
-- ============================================================================

create or replace function public.registrar_recebimento_frete(
  p_frete_id uuid,
  p_adiantamento numeric default null,
  p_saldo numeric default null,
  p_pagamento_realizado date default null
) returns public.fretes
language plpgsql security definer as $$
declare
  resultado public.fretes;
begin
  if public.meu_papel() not in ('admin', 'operacional', 'financeiro') then
    raise exception 'sem permissão para registrar recebimento de frete';
  end if;

  update public.fretes set
    adiantamento = coalesce(p_adiantamento, adiantamento),
    saldo = coalesce(p_saldo, saldo),
    pagamento_realizado = coalesce(p_pagamento_realizado, pagamento_realizado)
  where id = p_frete_id
  returning * into resultado;

  if resultado.id is null then
    raise exception 'frete não encontrado';
  end if;

  return resultado;
end;
$$;

grant execute on function public.registrar_recebimento_frete(uuid, numeric, numeric, date) to authenticated;
