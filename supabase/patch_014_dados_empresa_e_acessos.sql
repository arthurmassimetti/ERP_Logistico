-- ============================================================================
-- PATCH 014 — Dados da empresa (aba nova, só admin) + acessos mais rastreáveis.
--
-- Também fecha um problema real que apareceu na prática: excluir um usuário
-- travava porque fretes/veiculos/ordens_manutencao/fretes_status_historico
-- guardam "quem fez" (criado_por/situacao_por/aberta_por/concluida_por/
-- alterado_por) referenciando auth.users SEM "on delete set null" — a
-- exclusão ficava bloqueada até alguém zerar esses vínculos na mão, um por
-- um. Este patch recria essas 5 FKs com "on delete set null" de vez.
--
-- 1) EMPRESA — tabela de 1 linha só (singleton) com o que hoje não existe em
--    lugar nenhum: razão social, CNPJ, RNTRC da empresa, endereço, contato,
--    dados bancários e a comissão padrão de frete (hoje "500" vive
--    espalhado em 2 lugares do fretes.js e no default da coluna
--    fretes.comissao — aqui vira 1 valor configurável, que o formulário
--    passa a ler).
--
-- 2) PERFIS — ganha telefone e criado_por (rastreabilidade de quem criou
--    cada acesso). E-mail e último acesso não entram aqui: já existem em
--    auth.users / last_sign_in_at — a Edge Function admin-usuarios (que tem
--    a service key) lê de lá direto, sem duplicar dado que pode ficar
--    desatualizado.
--
-- 3) FKs de auditoria pra auth.users — recriadas com "on delete set null"
--    (via introspecção em pg_constraint, não assume nome de constraint).
--
-- Seguro rodar mais de uma vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) EMPRESA
-- ---------------------------------------------------------------------------
create table if not exists public.empresa (
  id                     integer primary key default 1 check (id = 1),  -- garante 1 linha só
  razao_social           text,
  nome_fantasia          text,
  cnpj                   text,
  inscricao_estadual     text,
  inscricao_municipal    text,
  rntrc                  text,
  endereco               text,
  cidade                 text,
  uf                     text,
  cep                    text,
  telefone               text,
  email                  text,
  responsavel_legal      text,
  logo_url               text,
  banco                  text,
  agencia                text,
  conta                  text,
  pix                    text,
  comissao_padrao_frete  numeric(12,2) not null default 500,
  atualizado_em          timestamptz not null default now()
);

insert into public.empresa (id) values (1) on conflict (id) do nothing;

alter table public.empresa enable row level security;

drop policy if exists "admin_gerencia_empresa" on public.empresa;
create policy "admin_gerencia_empresa" on public.empresa for all
  using (public.meu_papel() = 'admin')
  with check (public.meu_papel() = 'admin');

-- ---------------------------------------------------------------------------
-- 2) PERFIS — telefone + quem criou o acesso
-- ---------------------------------------------------------------------------
alter table public.perfis add column if not exists telefone text;
alter table public.perfis add column if not exists criado_por uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3) FKs de auditoria — recriadas com "on delete set null" (acha o nome real
--    da constraint em vez de assumir; funciona não importa como foi criada)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabela, a.attname as coluna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.conrelid in (
        'public.fretes'::regclass, 'public.veiculos'::regclass,
        'public.ordens_manutencao'::regclass, 'public.fretes_status_historico'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      r.tabela, r.conname, r.coluna);
  end loop;
end $$;

-- ============================================================================
-- FIM — depois de rodar, confira: 1) "select * from empresa" já traz 1 linha
-- (id=1, tudo null exceto comissao_padrao_frete=500); 2) só o papel admin
-- consegue ler/editar essa linha; 3) perfis ganhou as colunas telefone e
-- criado_por; 4) excluir um usuário de teste que tenha frete/veículo/ordem
-- antiga não trava mais (o campo "quem fez" vira null em vez de bloquear).
-- ============================================================================
