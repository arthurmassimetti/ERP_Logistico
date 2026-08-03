-- ============================================================================
-- PATCH 016 — Primeiro acesso obrigatório do motorista + tour guiado.
--
-- Hoje o motorista loga e cai direto no portal, mesmo com cadastro incompleto
-- (endereço, CNH, contato de emergência não existiam em lugar nenhum). Este
-- patch acrescenta os campos que faltam em motoristas, e um controle em
-- perfis pra saber se o motorista já preencheu o cadastro obrigatório e se já
-- viu o tour — o front (motorista-app.js) usa isso pra bloquear o portal até
-- o formulário ser enviado.
--
-- GRANDFATHERING: motoristas que JÁ têm login ativo hoje não devem ficar
-- travados de surpresa na próxima vez que entrarem — o backfill marca
-- cadastro_status='completo' pra quem já está em uso. Só logins de motorista
-- criados a partir de agora nascem 'pendente' (default da coluna).
--
-- "Usuário responsável pelas alterações cadastrais": em vez de só cobrir o
-- primeiro acesso, um trigger genérico (atualizado_em/atualizado_por) grava
-- em toda alteração de motoristas — tanto quando o próprio motorista
-- confirma o cadastro (via RPC) quanto quando um admin edita pela tela.
--
-- Seguro rodar mais de uma vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) MOTORISTAS — campos que faltavam pro cadastro completo
-- ---------------------------------------------------------------------------
alter table public.motoristas add column if not exists data_nascimento date;
alter table public.motoristas add column if not exists endereco text;
alter table public.motoristas add column if not exists cidade text;
alter table public.motoristas add column if not exists uf text;
alter table public.motoristas add column if not exists cep text;
alter table public.motoristas add column if not exists contato_emergencia_nome text;
alter table public.motoristas add column if not exists contato_emergencia_telefone text;
alter table public.motoristas add column if not exists atualizado_em timestamptz;
alter table public.motoristas add column if not exists atualizado_por uuid references auth.users(id) on delete set null;

-- registra quem mexeu e quando, em qualquer UPDATE (admin pela tela ou o
-- próprio motorista via RPC) — dispensa repetir esse carimbo em cada caminho
create or replace function public.motoristas_stamp_auditoria()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_motoristas_auditoria on public.motoristas;
create trigger trg_motoristas_auditoria
  before update on public.motoristas
  for each row execute function public.motoristas_stamp_auditoria();

-- ---------------------------------------------------------------------------
-- 2) PERFIS — status do cadastro obrigatório + tour
-- ---------------------------------------------------------------------------
alter table public.perfis add column if not exists cadastro_status text not null default 'pendente'
  check (cadastro_status in ('pendente', 'completo'));
alter table public.perfis add column if not exists primeiro_acesso_em timestamptz;
alter table public.perfis add column if not exists tour_concluido_em timestamptz;
alter table public.perfis add column if not exists tour_cancelado_em timestamptz;

-- grandfathering: quem já tem login de motorista funcionando hoje não é pego
-- de surpresa pelo formulário obrigatório na próxima vez que entrar
update public.perfis
set cadastro_status = 'completo', primeiro_acesso_em = coalesce(primeiro_acesso_em, criado_em)
where papel = 'motorista' and cadastro_status = 'pendente';

-- ---------------------------------------------------------------------------
-- 3) RPC — o motorista só edita o PRÓPRIO cadastro (motoristas não tem UPDATE
--    liberado pro papel motorista via RLS, de propósito: aqui a função
--    resolve o motorista_id a partir de quem está logado, nunca recebe id
--    solto por parâmetro).
-- ---------------------------------------------------------------------------
create or replace function public.concluir_primeiro_acesso(
  p_telefone text,
  p_cnh text,
  p_cnh_categoria text,
  p_cnh_validade date,
  p_endereco text,
  p_cidade text,
  p_uf text,
  p_cep text,
  p_contato_emergencia_nome text,
  p_contato_emergencia_telefone text,
  p_nome text default null,
  p_data_nascimento date default null,
  p_rg text default null
) returns public.motoristas
language plpgsql security definer as $$
declare
  v_motorista_id uuid;
  v_motorista public.motoristas;
begin
  select motorista_id into v_motorista_id from public.perfis where user_id = auth.uid();
  if v_motorista_id is null then
    raise exception 'seu login não está vinculado a um cadastro de motorista';
  end if;
  if p_telefone is null or p_cnh is null or p_cnh_validade is null
     or p_endereco is null or p_contato_emergencia_nome is null or p_contato_emergencia_telefone is null then
    raise exception 'preencha telefone, CNH, validade da CNH, endereço e contato de emergência';
  end if;

  update public.motoristas set
    nome                        = coalesce(p_nome, nome),
    telefone                    = p_telefone,
    cnh                         = p_cnh,
    cnh_categoria               = p_cnh_categoria,
    cnh_validade                = p_cnh_validade,
    endereco                    = p_endereco,
    cidade                      = p_cidade,
    uf                          = p_uf,
    cep                         = p_cep,
    contato_emergencia_nome     = p_contato_emergencia_nome,
    contato_emergencia_telefone = p_contato_emergencia_telefone,
    data_nascimento             = coalesce(p_data_nascimento, data_nascimento),
    rg                          = coalesce(p_rg, rg)
  where id = v_motorista_id
  returning * into v_motorista;

  update public.perfis set
    cadastro_status = 'completo',
    primeiro_acesso_em = now()
  where user_id = auth.uid();

  return v_motorista;
end;
$$;

grant execute on function public.concluir_primeiro_acesso(
  text, text, text, date, text, text, text, text, text, text, text, date, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPC — tour guiado (concluído ou pulado, sempre sobre o PRÓPRIO perfil)
-- ---------------------------------------------------------------------------
create or replace function public.registrar_tour_motorista(p_status text)
returns void
language plpgsql security definer as $$
begin
  if p_status not in ('concluido', 'cancelado') then
    raise exception 'status inválido: %', p_status;
  end if;
  if p_status = 'concluido' then
    update public.perfis set tour_concluido_em = now(), tour_cancelado_em = null where user_id = auth.uid();
  else
    update public.perfis set tour_cancelado_em = now() where user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.registrar_tour_motorista(text) to authenticated;

-- ============================================================================
-- FIM — depois de rodar, confira: 1) motoristas dos 3 logins de motorista já
-- existentes (arthur/lucas/luciano) ficaram com perfis.cadastro_status =
-- 'completo' (não vão ver o formulário na próxima vez que entrarem); 2) um
-- login de motorista NOVO nasce com cadastro_status='pendente'; 3) editar um
-- motorista pela tela de admin grava atualizado_em/atualizado_por sozinho.
-- ============================================================================
