-- ============================================================================
-- PATCH 011 — Garante que uma carreta não fique puxada por dois cavalos ao
-- mesmo tempo, e corrige a classificação de RKK4I86 (estava marcado como
-- cavalo, mas pela regra real da frota — só AXN/EHH/GAK/NNX/NNZ/EYV/MFU são
-- cavalo — ele é carreta. Já era o único "cavalo" sem motorista e sem
-- carreta vinculada, o que já indicava a inconsistência).
--
-- Seguro rodar mais de uma vez.
-- ============================================================================

update public.veiculos set tipo = 'carreta' where placa = 'RKK4I86' and tipo = 'cavalo';

alter table public.veiculos drop constraint if exists veiculos_carreta_placa_unico;
alter table public.veiculos add constraint veiculos_carreta_placa_unico unique (carreta_placa);

-- ============================================================================
-- FIM — múltiplos cavalos com carreta_placa NULA continuam permitidos
-- (unique não conflita com NULL); só bloqueia duas linhas apontando pra
-- MESMA carreta.
-- ============================================================================
