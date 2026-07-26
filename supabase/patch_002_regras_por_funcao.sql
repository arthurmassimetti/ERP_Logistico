-- ============================================================================
-- PATCH 002 — Refina as regras de acesso por função de trabalho, não só por
-- "papel genérico". Resolve dois problemas do desenho anterior:
--   1) Financeiro tinha CRUD completo em fretes/frota/roteiro/checklist
--      (deveria só LER fretes/motoristas/veículos/abastecimento, e nada além).
--   2) Contas fixas PESSOAIS (mesada, condomínio...) apareciam junto das da
--      empresa pra quem tivesse acesso financeiro — agora só o admin vê pessoal.
-- Seguro rodar mais de uma vez (usa "if exists" nos drops).
-- ============================================================================

-- ---- motoristas ----
drop policy if exists "equipe_acesso_total_motoristas" on public.motoristas;
create policy "adminop_gerencia_motoristas" on public.motoristas for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
create policy "financeiro_le_motoristas" on public.motoristas for select
  using (public.meu_papel() = 'financeiro');

-- ---- veiculos ----
drop policy if exists "equipe_acesso_total_veiculos" on public.veiculos;
create policy "adminop_gerencia_veiculos" on public.veiculos for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
create policy "financeiro_le_veiculos" on public.veiculos for select
  using (public.meu_papel() = 'financeiro');

-- ---- abastecimentos ----
drop policy if exists "equipe_acesso_total_abastecimentos" on public.abastecimentos;
create policy "adminop_gerencia_abastecimentos" on public.abastecimentos for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
create policy "financeiro_le_abastecimentos" on public.abastecimentos for select
  using (public.meu_papel() = 'financeiro');

-- ---- manutencoes (financeiro perde acesso; não é da função dele) ----
drop policy if exists "equipe_acesso_total_manutencoes" on public.manutencoes;
create policy "adminop_gerencia_manutencoes" on public.manutencoes for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));

-- ---- metricas_config (renomeia só por consistência, mesma regra) ----
drop policy if exists "equipe_acesso_total_metricas" on public.metricas_config;
create policy "admin_gerencia_metricas" on public.metricas_config for all
  using (public.meu_papel() = 'admin');

-- ---- roteiro (financeiro perde acesso) ----
drop policy if exists "equipe_acesso_total_roteiro" on public.roteiro;
create policy "adminop_gerencia_roteiro" on public.roteiro for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));

-- ---- fretes: financeiro passa de CRUD completo para só leitura ----
drop policy if exists "equipe_acesso_total_fretes" on public.fretes;
create policy "adminop_gerencia_fretes" on public.fretes for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
create policy "financeiro_le_fretes" on public.fretes for select
  using (public.meu_papel() = 'financeiro');

-- ---- checklists (financeiro perde acesso) ----
drop policy if exists "equipe_acesso_total_checklists" on public.checklists;
create policy "adminop_gerencia_checklists" on public.checklists for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));
-- (a policy "motorista_gerencia_proprio_checklist" já existe e continua igual)

-- ---- contas_fixas: separa pessoal (só admin) de empresa (admin+financeiro) ----
drop policy if exists "financeiro_acesso_total_fixas" on public.contas_fixas;
create policy "admin_gerencia_fixas_tudo" on public.contas_fixas for all
  using (public.meu_papel() = 'admin')
  with check (public.meu_papel() = 'admin');
create policy "financeiro_gerencia_fixas_empresa" on public.contas_fixas for all
  using (public.meu_papel() = 'financeiro' and origem = 'empresa')
  with check (public.meu_papel() = 'financeiro' and origem = 'empresa');

-- ============================================================================
-- Não precisou mexer em: contas_pagar, saldos_banco, vales, folha_semanal
-- (já eram exclusivas de admin+financeiro, sem 'pessoal' vs 'empresa' nelas),
-- nem em perfis, checklists-do-motorista, ou nas 3 views do patch 001.
-- ============================================================================
