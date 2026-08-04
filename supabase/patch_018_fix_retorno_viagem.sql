-- ============================================================================
-- PATCH 018 — Corrige 3 defeitos do patch_017 (rodar depois dele).
--
-- 1) VAZAMENTO (o motivo real deste patch): iniciar_viagem/finalizar_viagem
--    foram declaradas "returns public.fretes" — ou seja, devolviam as 30
--    colunas da tabela ao motorista, incluindo valor_frete, saldo,
--    adiantamento, diaria (total, não a fatia dele), pedagio_valor e banco.
--    A tela não mostra nada disso, mas o dado trafega e fica no navegador
--    dele — mesma categoria do bug de diária corrigido no patch_004, e
--    contra a regra central do sistema (motorista NUNCA vê valor_frete).
--    Passam a devolver o formato de vw_fretes_motorista, que é justamente a
--    projeção segura já usada pelo portal.
--    Ninguém foi exposto antes desta correção: nenhum frete estava em
--    'aguardando_coleta', então iniciar_viagem nunca chegou a ser chamada
--    com sucesso por um motorista de verdade.
--
-- 2) FUSO: o checklist gravava "data" pelo default current_date, que no
--    Supabase é UTC — das 21h à meia-noite de Brasília o registro nascia com
--    a data do dia seguinte. Não afeta mais a busca (desde o patch_017 a
--    chave é o frete, não o dia), mas sujava o histórico. Agora grava a data
--    local explicitamente.
--
-- 3) URGÊNCIA: todo item com problema virava ocorrência 'media'. Pneu e freio
--    passam a nascer 'alta', pra subirem no topo da fila da manutenção (a
--    tela de Ocorrências ordena por urgência). Continua SEM bloquear a saída
--    — decisão D1 do dono não muda: o checklist nunca segura a viagem.
--
-- Seguro rodar mais de uma vez.
-- ============================================================================

-- create or replace não muda tipo de retorno — precisa dropar antes
drop function if exists public.iniciar_viagem(uuid, numeric, jsonb, text);
drop function if exists public.finalizar_viagem(uuid, numeric);

create or replace function public.iniciar_viagem(
  p_frete_id uuid,
  p_km_inicial numeric,
  p_itens jsonb,
  p_observacao text default null
) returns public.vw_fretes_motorista
language plpgsql security definer as $$
declare
  v_motorista_id uuid;
  v_frete public.fretes;
  v_veiculo_placa text;
  v_checklist_id uuid;
  v_item record;
  v_tipo tipo_ocorrencia;
  v_urgencia urgencia_ocorrencia;
  v_resultado public.vw_fretes_motorista;
begin
  select motorista_id into v_motorista_id from public.perfis where user_id = auth.uid();
  if v_motorista_id is null then
    raise exception 'seu login não está vinculado a um cadastro de motorista';
  end if;

  select * into v_frete from public.fretes where id = p_frete_id for update;
  if v_frete.id is null then
    raise exception 'frete não encontrado';
  end if;
  if v_frete.motorista_id <> v_motorista_id then
    raise exception 'este frete não é seu';
  end if;
  if v_frete.status_entrega <> 'aguardando_coleta' then
    raise exception 'esta viagem já foi iniciada';
  end if;

  -- respeita o veículo já definido no frete pelo escritório; só usa o veículo
  -- atualmente vinculado ao motorista se o frete não tinha um definido
  v_veiculo_placa := v_frete.veiculo_placa;
  if v_veiculo_placa is null then
    select placa into v_veiculo_placa from public.veiculos where motorista_id = v_motorista_id limit 1;
  end if;
  if v_veiculo_placa is null then
    raise exception 'este frete não tem veículo definido e você não tem veículo vinculado';
  end if;

  -- data local explícita (o default current_date é UTC no Supabase)
  insert into public.checklists (tipo, frete_id, motorista_id, veiculo_placa, data, itens, observacao)
  values ('pre_viagem', p_frete_id, v_motorista_id, v_veiculo_placa,
          (now() at time zone 'America/Sao_Paulo')::date,
          coalesce(p_itens, '{}'::jsonb), p_observacao)
  returning id into v_checklist_id;

  -- 1 ocorrência por item marcado "problema" (não bloqueia, decisão D1),
  -- tipada pelo item pra já cair certa na fila da manutenção (decisão D3)
  for v_item in
    select key as chave from jsonb_each_text(coalesce(p_itens, '{}'::jsonb)) where value = 'problema'
  loop
    v_tipo := case v_item.chave
      when 'pneus' then 'pneu'::tipo_ocorrencia
      when 'freios' then 'freio'::tipo_ocorrencia
      when 'luzes' then 'luz'::tipo_ocorrencia
      else 'outro'::tipo_ocorrencia
    end;
    -- pneu e freio no topo da fila; o resto entra como média
    v_urgencia := case when v_item.chave in ('pneus', 'freios')
      then 'alta'::urgencia_ocorrencia else 'media'::urgencia_ocorrencia end;

    insert into public.ocorrencias (motorista_id, veiculo_placa, frete_id, checklist_id, tipo, descricao, urgencia)
    values (
      v_motorista_id, v_veiculo_placa, p_frete_id, v_checklist_id, v_tipo,
      'Reportado no checklist de início de viagem (' || v_item.chave || ')'
        || case when p_observacao is not null then ' — ' || p_observacao else '' end,
      v_urgencia
    );
  end loop;

  update public.fretes set
    status_entrega = 'em_transito',
    km_inicial = p_km_inicial
  where id = p_frete_id;

  -- devolve a projeção SEGURA (sem valor_frete/saldo/adiantamento/diária total)
  select * into v_resultado from public.vw_fretes_motorista where id = p_frete_id;
  return v_resultado;
end;
$$;

grant execute on function public.iniciar_viagem(uuid, numeric, jsonb, text) to authenticated;

create or replace function public.finalizar_viagem(
  p_frete_id uuid,
  p_km_final numeric
) returns public.vw_fretes_motorista
language plpgsql security definer as $$
declare
  v_motorista_id uuid;
  v_frete public.fretes;
  v_resultado public.vw_fretes_motorista;
begin
  select motorista_id into v_motorista_id from public.perfis where user_id = auth.uid();
  if v_motorista_id is null then
    raise exception 'seu login não está vinculado a um cadastro de motorista';
  end if;

  select * into v_frete from public.fretes where id = p_frete_id for update;
  if v_frete.id is null then
    raise exception 'frete não encontrado';
  end if;
  if v_frete.motorista_id <> v_motorista_id then
    raise exception 'este frete não é seu';
  end if;
  if v_frete.status_entrega <> 'em_transito' then
    raise exception 'esta viagem não está em trânsito';
  end if;
  if p_km_final is not null and v_frete.km_inicial is not null and p_km_final < v_frete.km_inicial then
    raise exception 'km final não pode ser menor que o km inicial (%)', v_frete.km_inicial;
  end if;

  update public.fretes set
    status_entrega = 'entregue',
    km_final = p_km_final
  where id = p_frete_id;

  select * into v_resultado from public.vw_fretes_motorista where id = p_frete_id;
  return v_resultado;
end;
$$;

grant execute on function public.finalizar_viagem(uuid, numeric) to authenticated;

-- ============================================================================
-- FIM — depois de rodar, confira: 1) iniciar_viagem devolve só as colunas de
-- vw_fretes_motorista (sem valor_frete/saldo/adiantamento); 2) um checklist
-- criado depois das 21h fica com a data de HOJE, não a de amanhã; 3) marcar
-- "problema" em freios gera ocorrência com urgência alta, e ela aparece no
-- topo da tela de Ocorrências.
-- ============================================================================
