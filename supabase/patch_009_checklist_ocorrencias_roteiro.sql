-- ============================================================================
-- PATCH 009 — Etapa 2 da v1.0: ocorrências (relato de problema do motorista),
-- limite de um checklist por dia, e ligação da ordem de manutenção com a
-- ocorrência que a originou.
--
-- Não mexe em roteiro/fretes (sem tabela "viagens" nova, como decidido) —
-- o vínculo "tarefa afetada por veículo bloqueado" é feito no cliente,
-- olhando o veículo hoje vinculado ao motorista da tarefa.
--
-- Seguro rodar mais de uma vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) OCORRÊNCIAS — o que o motorista relatou. Sem diagnóstico, sem bloqueio,
--    sem abertura de ordem: tudo isso é do responsável pela frota (RLS abaixo
--    só dá insert+select ao motorista, nunca update/delete — mesma imutabi-
--    lidade do checklist, corrigida no patch_008).
-- ---------------------------------------------------------------------------
do $$ begin
  create type tipo_ocorrencia as enum ('pneu', 'freio', 'luz', 'motor', 'eletrica', 'outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type urgencia_ocorrencia as enum ('baixa', 'media', 'alta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_ocorrencia as enum ('aberta', 'em_analise', 'resolvida', 'descartada');
exception when duplicate_object then null; end $$;

create table if not exists public.ocorrencias (
  id            uuid primary key default gen_random_uuid(),
  motorista_id  uuid not null references public.motoristas(id),
  veiculo_placa text references public.veiculos(placa),
  roteiro_id    uuid references public.roteiro(id),
  frete_id      uuid references public.fretes(id),
  checklist_id  uuid references public.checklists(id),
  tipo          tipo_ocorrencia not null default 'outro',
  descricao     text,
  urgencia      urgencia_ocorrencia not null default 'media',
  status        status_ocorrencia not null default 'aberta',
  criado_em     timestamptz not null default now(),
  resolvido_em  timestamptz,
  resolvido_por uuid references auth.users(id),
  resolucao     text
);
create index if not exists idx_ocorrencias_motorista on public.ocorrencias(motorista_id);
create index if not exists idx_ocorrencias_status on public.ocorrencias(status);

alter table public.ocorrencias enable row level security;

drop policy if exists "motorista_cria_propria_ocorrencia" on public.ocorrencias;
create policy "motorista_cria_propria_ocorrencia" on public.ocorrencias for insert
  with check (motorista_id = public.meu_motorista_id());

drop policy if exists "motorista_le_propria_ocorrencia" on public.ocorrencias;
create policy "motorista_le_propria_ocorrencia" on public.ocorrencias for select
  using (motorista_id = public.meu_motorista_id());

drop policy if exists "adminop_gerencia_ocorrencias" on public.ocorrencias;
create policy "adminop_gerencia_ocorrencias" on public.ocorrencias for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));

grant select, insert, update, delete on public.ocorrencias to authenticated;
grant all privileges on public.ocorrencias to service_role;

-- ---------------------------------------------------------------------------
-- 2) CHECKLISTS — no máximo um por motorista+veículo+dia (reforça no banco
--    o que a tela já evita, protegendo contra duplo-toque/corrida).
-- ---------------------------------------------------------------------------
alter table public.checklists drop constraint if exists checklists_motorista_veiculo_dia_unico;
alter table public.checklists add constraint checklists_motorista_veiculo_dia_unico
  unique (motorista_id, veiculo_placa, data);

-- ---------------------------------------------------------------------------
-- 3) ORDEM DE MANUTENÇÃO — liga de volta à ocorrência que a originou.
-- ---------------------------------------------------------------------------
alter table public.ordens_manutencao add column if not exists ocorrencia_id uuid references public.ocorrencias(id);
create index if not exists idx_ordens_manutencao_ocorrencia on public.ordens_manutencao(ocorrencia_id);

-- ---------------------------------------------------------------------------
-- 4) CONCLUIR ORDEM — agora também resolve a ocorrência vinculada (se houver),
--    na mesma transação que já fecha a ordem, gera o custo e libera o veículo.
--    Mesma assinatura do patch_008 (create or replace só troca o corpo).
-- ---------------------------------------------------------------------------
create or replace function public.concluir_ordem_manutencao(
  p_ordem_id uuid,
  p_servico_realizado text,
  p_valor_pecas numeric default null,
  p_valor_mao_obra numeric default null,
  p_liberar_veiculo boolean default false
) returns public.ordens_manutencao
language plpgsql as $$
declare
  ordem public.ordens_manutencao;
  nova_manutencao_id uuid;
begin
  select * into ordem from public.ordens_manutencao where id = p_ordem_id for update;

  if ordem.id is null then
    raise exception 'ordem de manutenção não encontrada';
  end if;
  if ordem.status in ('concluida', 'cancelada') then
    raise exception 'ordem já está %, não pode ser concluída de novo', ordem.status;
  end if;

  update public.ordens_manutencao set
    status = 'concluida',
    servico_realizado = coalesce(p_servico_realizado, servico_realizado),
    valor_pecas = coalesce(p_valor_pecas, valor_pecas),
    valor_mao_obra = coalesce(p_valor_mao_obra, valor_mao_obra),
    concluida_em = now(),
    concluida_por = auth.uid()
  where id = p_ordem_id
  returning * into ordem;

  insert into public.manutencoes (veiculo_placa, data, km, servico, valor, oficina, os_nf, categoria)
  values (ordem.veiculo_placa, current_date, ordem.km, ordem.servico_realizado, ordem.valor_total,
          ordem.oficina, 'OM-' || ordem.numero, ordem.tipo::text)
  returning id into nova_manutencao_id;

  update public.ordens_manutencao set manutencao_id = nova_manutencao_id
  where id = p_ordem_id
  returning * into ordem;

  if ordem.ocorrencia_id is not null then
    update public.ocorrencias set
      status = 'resolvida',
      resolvido_em = now(),
      resolvido_por = auth.uid(),
      resolucao = coalesce(resolucao, 'Resolvida pela ordem de manutenção #' || ordem.numero)
    where id = ordem.ocorrencia_id and status not in ('resolvida', 'descartada');
  end if;

  if p_liberar_veiculo then
    update public.veiculos set
      situacao = 'disponivel',
      situacao_motivo = 'Liberado após conclusão da OM #' || ordem.numero
    where placa = ordem.veiculo_placa;
  end if;

  return ordem;
end;
$$;

grant execute on function public.concluir_ordem_manutencao(uuid, text, numeric, numeric, boolean) to authenticated;

-- ============================================================================
-- FIM — depois de rodar, confira: 1) Table Editor mostra ocorrencias;
-- 2) um insert de checklist repetido no mesmo dia/motorista/veículo dá erro
-- de unique violation (23505); 3) concluir uma ordem com ocorrencia_id
-- preenchido marca a ocorrência como resolvida.
-- ============================================================================
