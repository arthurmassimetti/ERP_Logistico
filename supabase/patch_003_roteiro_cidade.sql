-- ============================================================================
-- PATCH 003 — Roteiro Diário: adiciona a coluna de cidade do destino.
-- Seguro rodar mais de uma vez.
-- ============================================================================
alter table public.roteiro add column if not exists destino_cidade text;
