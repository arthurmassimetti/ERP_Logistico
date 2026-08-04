-- ============================================================================
-- PATCH 017 — Início/fim de viagem amarrado ao checklist do caminhão, e
-- primeiro acesso obrigatório para QUALQUER papel (não só motorista).
--
-- Decisões do dono (04/08/2026, sessão de análise checklist/CNH/CPF/viagem):
--  D1) o checklist NUNCA bloqueia a saída — item com problema só abre ocorrência.
--  D2) só checklist do CAMINHÃO — sem checklist de carga por categoria.
--  D3) resultado agrega no FRETE (feito / feito com pendência, prova da viagem)
--      E na MANUTENÇÃO (pendência vira ocorrência na fila da frota).
--  D4) os 3 admins de hoje (Lucas/Arthur/Luciano) ficam dispensados do cadastro
--      obrigatório — grandfathering, igual ao que o patch_016 já fez pra
--      motorista. Login novo de qualquer papel (não só motorista) passa a
--      nascer 'pendente' e cair no formulário obrigatório no primeiro login.
--
-- "Viagem" não vira tabela nova — é o frete (já tem motorista, veículo,
-- cliente, status_entrega com realtime). "Iniciar viagem" grava o checklist
-- com frete_id preenchido (a coluna existe desde o patch_009 e nunca foi
-- usada), move status_entrega pra em_transito e abre 1 ocorrência por item
-- marcado "problema" (tipada corretamente: pneu/freio/luz/outro). "Finalizar
-- entrega" só pede km final e marca entregue.
--
-- Seguro rodar mais de uma vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) CHECKLISTS — a trava antiga era 1 por motorista+veículo+DIA (patch_009),
--    o que impede uma segunda viagem no mesmo dia. Vira 1 por FRETE: cada
--    viagem tem no máximo um checklist de início.
-- ---------------------------------------------------------------------------
alter table public.checklists drop constraint if exists checklists_motorista_veiculo_dia_unico;
create unique index if not exists checklists_frete_unico on public.checklists(frete_id) where frete_id is not null;

-- ---------------------------------------------------------------------------
-- 2) FRETES — km inicial/final da viagem (não existia em lugar nenhum).
-- ---------------------------------------------------------------------------
alter table public.fretes add column if not exists km_inicial numeric(10,1);
alter table public.fretes add column if not exists km_final numeric(10,1);

-- vw_fretes_motorista passa a expor status_entrega + km, pro portal saber
-- qual é a viagem atual do motorista sem enxergar valor_frete/saldo (mesma
-- proteção de sempre: filtro embutido por meu_motorista_id(), não RLS
-- pass-through — "Unrestricted" no linter aqui é falso positivo esperado,
-- ver comentário original no patch_001).
create or replace view public.vw_fretes_motorista as
select
  f.id, f.data, f.motorista_id, f.veiculo_placa, f.origem, f.destino, f.transportadora,
  f.diaria_motorista as diaria, f.comissao, f.ciot, f.pagamento_previsto, f.pagamento_realizado,
  f.observacao, f.status_entrega, f.km_inicial, f.km_final
from public.fretes f
where f.motorista_id = public.meu_motorista_id();

-- ---------------------------------------------------------------------------
-- 3) INICIAR VIAGEM — checklist do caminhão + move o kanban + abre ocorrência
--    por item com problema. security definer: motorista não tem UPDATE/INSERT
--    liberado em fretes/checklists/ocorrencias via RLS (mesmo padrão já usado
--    em concluir_primeiro_acesso e registrar_recebimento_frete) — a função
--    resolve o motorista pelo login, nunca recebe id solto por parâmetro.
--    Nunca bloqueia por causa de item com problema (decisão D1).
-- ---------------------------------------------------------------------------
create or replace function public.iniciar_viagem(
  p_frete_id uuid,
  p_km_inicial numeric,
  p_itens jsonb,
  p_observacao text default null
) returns public.fretes
language plpgsql security definer as $$
declare
  v_motorista_id uuid;
  v_frete public.fretes;
  v_veiculo_placa text;
  v_checklist_id uuid;
  v_item record;
  v_tipo tipo_ocorrencia;
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

  insert into public.checklists (tipo, frete_id, motorista_id, veiculo_placa, itens, observacao)
  values ('pre_viagem', p_frete_id, v_motorista_id, v_veiculo_placa, coalesce(p_itens, '{}'::jsonb), p_observacao)
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
    insert into public.ocorrencias (motorista_id, veiculo_placa, frete_id, checklist_id, tipo, descricao, urgencia)
    values (
      v_motorista_id, v_veiculo_placa, p_frete_id, v_checklist_id, v_tipo,
      'Reportado no checklist de início de viagem (' || v_item.chave || ')'
        || case when p_observacao is not null then ' — ' || p_observacao else '' end,
      'media'
    );
  end loop;

  update public.fretes set
    status_entrega = 'em_transito',
    km_inicial = p_km_inicial
  where id = p_frete_id
  returning * into v_frete;

  return v_frete;
end;
$$;

grant execute on function public.iniciar_viagem(uuid, numeric, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) FINALIZAR ENTREGA — só km final + status entregue. Sem checklist de
--    chegada (decisão D2: só checklist do caminhão, na saída).
-- ---------------------------------------------------------------------------
create or replace function public.finalizar_viagem(
  p_frete_id uuid,
  p_km_final numeric
) returns public.fretes
language plpgsql security definer as $$
declare
  v_motorista_id uuid;
  v_frete public.fretes;
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
  where id = p_frete_id
  returning * into v_frete;

  return v_frete;
end;
$$;

grant execute on function public.finalizar_viagem(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) PERFIS — campos "comuns" do primeiro acesso obrigatório, iguais pra
--    qualquer papel (motorista já tinha isso desde o patch_016, só que na
--    tabela motoristas — aqui é a versão pros demais papéis, que não têm
--    tabela de cadastro pessoal própria).
-- ---------------------------------------------------------------------------
alter table public.perfis add column if not exists cpf text;
alter table public.perfis add column if not exists data_nascimento date;
alter table public.perfis add column if not exists endereco text;
alter table public.perfis add column if not exists cidade text;
alter table public.perfis add column if not exists uf text;
alter table public.perfis add column if not exists cep text;
alter table public.perfis add column if not exists contato_emergencia_nome text;
alter table public.perfis add column if not exists contato_emergencia_telefone text;

create unique index if not exists perfis_cpf_unico on public.perfis(cpf) where cpf is not null;

-- ---------------------------------------------------------------------------
-- 6) GRANDFATHERING (decisão D4) — dispensa quem já usa o painel hoje; só
--    login criado a partir de agora nasce 'pendente' e cai no formulário.
--    (patch_016 já tinha feito isso só para papel='motorista'; aqui cobre
--    os demais papéis.)
-- ---------------------------------------------------------------------------
update public.perfis
set cadastro_status = 'completo', primeiro_acesso_em = coalesce(primeiro_acesso_em, criado_em)
where papel <> 'motorista' and cadastro_status = 'pendente';

-- ---------------------------------------------------------------------------
-- 7) RPC genérica de primeiro acesso — substitui a versão só-motorista do
--    patch_016 (assinatura mudou: 1 parâmetro jsonb em vez de 13 posicionais,
--    por isso precisa dropar a antiga antes de recriar). Campos comuns vão
--    pra motoristas OU perfis dependendo do papel de quem chamou (resolvido
--    pelo login, nunca por parâmetro); CNH continua exclusiva de motorista.
--    Sem bloco específico por papel além de motorista — não existe hoje
--    nenhum dado próprio de operacional/financeiro/admin em lugar nenhum do
--    sistema, então criar um campo só pro formulário seria dado morto.
-- ---------------------------------------------------------------------------
drop function if exists public.concluir_primeiro_acesso(
  text, text, text, date, text, text, text, text, text, text, text, date, text
);

create or replace function public.concluir_primeiro_acesso(p_dados jsonb)
returns jsonb
language plpgsql security definer as $$
declare
  v_papel papel_usuario;
  v_motorista_id uuid;
  v_cpf text := nullif(trim(p_dados->>'cpf'), '');
  v_telefone text := nullif(trim(p_dados->>'telefone'), '');
  v_endereco text := nullif(trim(p_dados->>'endereco'), '');
  v_contato_nome text := nullif(trim(p_dados->>'contato_emergencia_nome'), '');
  v_contato_tel text := nullif(trim(p_dados->>'contato_emergencia_telefone'), '');
  v_resultado jsonb;
begin
  select papel, motorista_id into v_papel, v_motorista_id from public.perfis where user_id = auth.uid();
  if v_papel is null then
    raise exception 'perfil de acesso não encontrado';
  end if;
  if v_telefone is null or v_endereco is null or v_contato_nome is null or v_contato_tel is null then
    raise exception 'preencha telefone, endereço e contato de emergência';
  end if;

  if v_papel = 'motorista' then
    if v_motorista_id is null then
      raise exception 'seu login não está vinculado a um cadastro de motorista';
    end if;
    if (p_dados->>'cnh') is null or (p_dados->>'cnh_validade') is null then
      raise exception 'preencha a CNH e a validade';
    end if;

    update public.motoristas set
      nome                        = coalesce(nullif(trim(p_dados->>'nome'), ''), nome),
      cpf                         = coalesce(cpf, v_cpf),  -- nunca sobrescreve CPF já cadastrado
      telefone                    = v_telefone,
      cnh                         = nullif(trim(p_dados->>'cnh'), ''),
      cnh_categoria               = nullif(trim(p_dados->>'cnh_categoria'), ''),
      cnh_validade                = (p_dados->>'cnh_validade')::date,
      endereco                    = v_endereco,
      cidade                      = nullif(trim(p_dados->>'cidade'), ''),
      uf                          = nullif(trim(p_dados->>'uf'), ''),
      cep                         = nullif(trim(p_dados->>'cep'), ''),
      contato_emergencia_nome     = v_contato_nome,
      contato_emergencia_telefone = v_contato_tel,
      data_nascimento             = coalesce(nullif(p_dados->>'data_nascimento', '')::date, data_nascimento),
      rg                          = coalesce(nullif(trim(p_dados->>'rg'), ''), rg)
    where id = v_motorista_id
    returning to_jsonb(motoristas.*) into v_resultado;
  else
    update public.perfis set
      nome                         = coalesce(nullif(trim(p_dados->>'nome'), ''), nome),
      cpf                          = coalesce(cpf, v_cpf),
      telefone                     = v_telefone,
      data_nascimento              = coalesce(nullif(p_dados->>'data_nascimento', '')::date, data_nascimento),
      endereco                     = v_endereco,
      cidade                       = nullif(trim(p_dados->>'cidade'), ''),
      uf                           = nullif(trim(p_dados->>'uf'), ''),
      cep                          = nullif(trim(p_dados->>'cep'), ''),
      contato_emergencia_nome      = v_contato_nome,
      contato_emergencia_telefone  = v_contato_tel
    where user_id = auth.uid()
    returning to_jsonb(perfis.*) into v_resultado;
  end if;

  update public.perfis set cadastro_status = 'completo', primeiro_acesso_em = now() where user_id = auth.uid();

  return v_resultado;
end;
$$;

grant execute on function public.concluir_primeiro_acesso(jsonb) to authenticated;

-- ============================================================================
-- FIM — depois de rodar, confira: 1) inserir 2 checklists pro mesmo motorista
-- no mesmo dia mas frete_id diferente não dá mais erro de unique violation;
-- 2) "select * from fretes limit 1" tem km_inicial/km_final; 3) os 3 perfis
-- admin de hoje (Lucas/Arthur/Luciano) ficaram com cadastro_status='completo';
-- 4) um perfil novo (qualquer papel) continua nascendo 'pendente'; 5) chamar
-- iniciar_viagem com um frete aguardando_coleta muda pra em_transito, grava
-- km_inicial e cria 1 checklist com frete_id preenchido; um item "problema"
-- vira 1 linha em ocorrencias com checklist_id preenchido; 6) finalizar_viagem
-- muda pra entregue e grava km_final.
-- ============================================================================
