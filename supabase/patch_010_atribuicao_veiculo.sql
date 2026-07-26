-- ============================================================================
-- PATCH 010 — Garante que um motorista não fique vinculado a dois veículos
-- ao mesmo tempo, agora que o painel ganhou telas de criar/editar veículo e
-- de trocar quem dirige (antes disso não existia risco, porque não havia
-- interface nenhuma pra alterar veiculos.motorista_id).
--
-- Conferido antes de aplicar: nenhum motorista_id duplicado hoje entre os
-- 18 veículos, e nenhuma carreta tem motorista_id preenchido (só cavalo é
-- "dirigido") — constraint é segura de aplicar.
--
-- Seguro rodar mais de uma vez.
-- ============================================================================

alter table public.veiculos drop constraint if exists veiculos_motorista_id_unico;
alter table public.veiculos add constraint veiculos_motorista_id_unico unique (motorista_id);

-- ============================================================================
-- FIM — múltiplos veículos com motorista_id NULO continuam permitidos
-- (unique não conflita com NULL); só bloqueia dois veículos com o MESMO
-- motorista preenchido.
-- ============================================================================
