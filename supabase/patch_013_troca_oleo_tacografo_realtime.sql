-- ============================================================================
-- PATCH 013 — Registrar troca de óleo / renovação de tacógrafo (com reset
-- automático) + tempo real na tela de Frota.
--
-- Hoje km_troca e tacografo_venc só mudam pelo formulário geral de "Editar
-- veículo" (edição manual, sem regra nenhuma). Este patch adiciona duas ações
-- dedicadas, no mesmo espírito do patch_008 (concluir_ordem_manutencao):
-- transacionais (ou tudo acontece, ou nada), e cada uma já gera a linha de
-- custo correspondente em manutencoes (livro-caixa existente).
--
-- Regra combinada com o cliente: troca de óleo a cada 30.000 km (reseta
-- km_troca = km da troca + 30.000) e, a cada 3 trocas de óleo, também é
-- preciso trocar o filtro de ar. Os dois números (30.000 km e "a cada 3
-- trocas") viram colunas com esse valor padrão — dá pra ajustar depois por
-- veículo direto no banco, sem mexer em código, se algum caminhão tiver
-- regra diferente.
--
-- Também liga "veiculos" à publicação supabase_realtime (mesma mecânica do
-- patch_012 pro Kanban de fretes), pra tela de Frota sincronizar sozinha
-- entre abas/usuários sem F5. Não é telemetria/rastreador — km_atual continua
-- sendo digitado (por uma tela ou, no futuro, por uma integração que grave
-- na mesma coluna); isso só faz a TELA reagir mais rápido a quem grava.
--
-- Seguro rodar mais de uma vez (colunas com "if not exists", funções com
-- "create or replace", publicação checada via pg_publication_tables).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) VEÍCULOS — contadores e intervalos da regra de óleo/filtro de ar.
-- ---------------------------------------------------------------------------
alter table public.veiculos add column if not exists troca_oleo_contador integer not null default 0;
alter table public.veiculos add column if not exists filtro_ar_referencia_contador integer not null default 0;
alter table public.veiculos add column if not exists intervalo_troca_oleo_km integer not null default 30000;
alter table public.veiculos add column if not exists intervalo_trocas_filtro_ar integer not null default 3;

comment on column public.veiculos.troca_oleo_contador is
  'quantas trocas de óleo já foram registradas via registrar_troca_oleo (nunca editado à mão)';
comment on column public.veiculos.filtro_ar_referencia_contador is
  'valor de troca_oleo_contador na última vez que o filtro de ar foi trocado; filtro está devido quando (troca_oleo_contador - este valor) >= intervalo_trocas_filtro_ar';

-- ---------------------------------------------------------------------------
-- 2) REGISTRAR TROCA DE ÓLEO — atualiza km_atual/km_troca, incrementa o
--    contador, opcionalmente também quita o filtro de ar, e grava o(s)
--    custo(s) em manutencoes. SECURITY INVOKER (padrão): admin/operacional já
--    têm CRUD completo em veiculos e manutencoes (schema.sql), só precisa da
--    atomicidade.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_troca_oleo(
  p_placa text,
  p_km_atual integer,
  p_data date default null,
  p_oficina text default null,
  p_valor_oleo numeric default null,
  p_trocar_filtro_ar boolean default false,
  p_valor_filtro_ar numeric default null
) returns public.veiculos
language plpgsql as $$
declare
  v public.veiculos;
  novo_contador integer;
begin
  select * into v from public.veiculos where placa = p_placa for update;
  if v.placa is null then
    raise exception 'veículo % não encontrado', p_placa;
  end if;
  if p_km_atual is null then
    raise exception 'informe o km no momento da troca';
  end if;
  if v.km_atual is not null and p_km_atual < v.km_atual then
    raise exception 'km informado (%) não pode ser menor que o km atual do veículo (%)', p_km_atual, v.km_atual;
  end if;

  novo_contador := coalesce(v.troca_oleo_contador, 0) + 1;

  update public.veiculos set
    km_atual = p_km_atual,
    km_troca = p_km_atual + coalesce(v.intervalo_troca_oleo_km, 30000),
    troca_oleo_contador = novo_contador,
    filtro_ar_referencia_contador = case when p_trocar_filtro_ar then novo_contador else v.filtro_ar_referencia_contador end
  where placa = p_placa
  returning * into v;

  insert into public.manutencoes (veiculo_placa, data, km, servico, valor, oficina, categoria)
  values (p_placa, coalesce(p_data, current_date), p_km_atual, 'Troca de óleo (#' || novo_contador || ')', p_valor_oleo, p_oficina, 'troca_oleo');

  if p_trocar_filtro_ar then
    insert into public.manutencoes (veiculo_placa, data, km, servico, valor, oficina, categoria)
    values (p_placa, coalesce(p_data, current_date), p_km_atual, 'Troca de filtro de ar', p_valor_filtro_ar, p_oficina, 'filtro_ar');
  end if;

  return v;
end;
$$;

grant execute on function public.registrar_troca_oleo(text, integer, date, text, numeric, boolean, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) REGISTRAR RENOVAÇÃO DE TACÓGRAFO — nova validade + custo opcional.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_renovacao_tacografo(
  p_placa text,
  p_nova_validade date,
  p_observacao text default null,
  p_data date default null,
  p_oficina text default null,
  p_valor numeric default null
) returns public.veiculos
language plpgsql as $$
declare
  v public.veiculos;
begin
  if p_nova_validade is null then
    raise exception 'informe a nova validade do tacógrafo';
  end if;

  update public.veiculos set
    tacografo_venc = p_nova_validade,
    tacografo_obs = p_observacao
  where placa = p_placa
  returning * into v;

  if v.placa is null then
    raise exception 'veículo % não encontrado', p_placa;
  end if;

  insert into public.manutencoes (veiculo_placa, data, km, servico, valor, oficina, categoria)
  values (p_placa, coalesce(p_data, current_date), v.km_atual, 'Renovação do tacógrafo', p_valor, p_oficina, 'tacografo');

  return v;
end;
$$;

grant execute on function public.registrar_renovacao_tacografo(text, date, text, date, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) REALTIME — liga veiculos à publicação padrão do Supabase, para a tela de
--    Frota refletir mudanças de outras abas/usuários sem precisar recarregar
--    (mesma mecânica do patch_012 para fretes).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'veiculos'
  ) then
    alter publication supabase_realtime add table public.veiculos;
  end if;
end $$;

-- ============================================================================
-- FIM — depois de rodar, confira: 1) veiculos ganhou as 4 colunas novas (todo
-- veículo existente começa com contador 0, intervalo 30000/3); 2) registrar
-- uma troca de óleo pela tela atualiza km_atual/km_troca e cria 1 linha em
-- manutencoes (2 linhas se marcar o filtro de ar); 3) na 3ª troca seguida sem
-- trocar o filtro, a tela sinaliza "trocar filtro de ar"; 4) em Database >
-- Replication, a tabela veiculos aparece marcada.
-- ============================================================================
