-- ============================================================================
-- PATCH 004 — Divide a diária em "total recebido" x "repassado ao motorista".
-- Hoje a diária inteira (ex.: R$ 700) era tratada como um valor só, mas na
-- prática só uma parte (ex.: R$ 250) vai pro motorista — o resto (R$ 450)
-- fica com a empresa. Sem essa coluna o portal do motorista mostrava o valor
-- TOTAL da diária, não o que ele realmente recebe.
-- Seguro rodar mais de uma vez.
-- ============================================================================
alter table public.fretes add column if not exists diaria_motorista numeric(12,2) default 0;

-- Fretes já lançados: assume que a diária toda ia pro motorista (comportamento
-- antigo). Ajuste manualmente os fretes que tiveram retenção da empresa.
update public.fretes set diaria_motorista = diaria where diaria_motorista = 0 and diaria > 0;

-- vw_fretes_motorista passa a expor a FATIA do motorista (diaria_motorista),
-- nunca a diária total recebida da empresa cliente — mesmo motivo de valor_frete
-- ficar de fora dessa view.
create or replace view public.vw_fretes_motorista as
select
  f.id, f.data, f.motorista_id, f.veiculo_placa, f.origem, f.destino, f.transportadora,
  f.diaria_motorista as diaria, f.comissao, f.ciot, f.pagamento_previsto, f.pagamento_realizado, f.observacao
from public.fretes f
where f.motorista_id = public.meu_motorista_id();
