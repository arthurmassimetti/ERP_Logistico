-- ============================================================================
-- PATCH 007 — Categoria da carga + volumetria (peso/cubagem) por frete.
--
-- Tabela de verdade (não enum fixo) pra poder ativar/desativar ou adicionar
-- categoria nova sem precisar mexer em schema depois — mesmo espírito de
-- metricas_config. Lista inicial cobre os tipos de carga usados no mercado
-- de transporte rodoviário brasileiro (a maioria não vai se aplicar à
-- operação de vocês agora, mas fica disponível se um dia aparecer).
--
-- Peso/cubagem só existem pra fretes lançados a partir de agora — não dá
-- pra reconstruir isso retroativamente pros fretes já migrados.
-- Seguro rodar mais de uma vez.
-- ============================================================================

create table if not exists public.categorias_carga (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null unique,
  exige_seguro_especial  boolean not null default false,  -- ex.: perigosa, viva, indivisível
  ativa                  boolean not null default true,
  criado_em              timestamptz not null default now()
);

insert into public.categorias_carga (nome, exige_seguro_especial) values
  ('Carga Geral', false),
  ('Granel Sólido', false),
  ('Granel Líquido', false),
  ('Carga Perigosa (ADR/ONU)', true),
  ('Carga Refrigerada/Frigorificada', false),
  ('Carga Viva (animais)', true),
  ('Carga Frágil/Especial', false),
  ('Carga Indivisível/Superdimensionada', true),
  ('Mudança', false),
  ('Contêiner', false),
  ('Carga Unitizada (big-bag/pallet)', false),
  ('Veículos (cegonha)', false)
on conflict (nome) do nothing;

alter table public.fretes add column if not exists categoria_carga_id uuid references public.categorias_carga(id);
alter table public.fretes add column if not exists peso_kg numeric(12,3);
alter table public.fretes add column if not exists cubagem_m3 numeric(10,3);

alter table public.categorias_carga enable row level security;

-- admin+operacional gerenciam a lista (ativar/desativar/criar categoria nova);
-- financeiro só lê (aparece junto do frete quando ela confere recebíveis)
drop policy if exists "adminop_gerencia_categorias_carga" on public.categorias_carga;
create policy "adminop_gerencia_categorias_carga" on public.categorias_carga for all
  using (public.meu_papel() in ('admin','operacional'))
  with check (public.meu_papel() in ('admin','operacional'));

drop policy if exists "financeiro_le_categorias_carga" on public.categorias_carga;
create policy "financeiro_le_categorias_carga" on public.categorias_carga for select
  using (public.meu_papel() = 'financeiro');

grant select, insert, update, delete on public.categorias_carga to authenticated;
grant all privileges on public.categorias_carga to service_role;
