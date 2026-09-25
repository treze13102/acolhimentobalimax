-- =====================================================================
--  Canal de Acolhimento — Balimax Engenharia
--  Rode este arquivo uma vez no SQL Editor do Supabase.
--
--  Modelo de acesso: NENHUM cliente fala com o banco diretamente.
--  RLS fica ligado e sem políticas de permissão, o que nega tudo para
--  as chaves anon e authenticated. Todo acesso passa pelas funções em
--  /api, que usam a service_role. Assim, mesmo que a chave pública
--  vaze, ela não lê um único relato.
-- =====================================================================

-- ---------------------------------------------------------------- perfis
-- Complementa auth.users com papel e situação. O login em si é do
-- Supabase Auth; aqui fica apenas a autorização.
create table if not exists public.perfis (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  email         text not null,
  papel         text not null default 'acolhimento' check (papel in ('admin', 'acolhimento')),
  ativo         boolean not null default true,
  -- Senha provisoria entregue pelo admin: o painel exige a troca no 1o acesso.
  trocar_senha  boolean not null default true,
  criado_em     timestamptz not null default now(),
  ultimo_acesso timestamptz
);

-- ------------------------------------------------------------- registros
-- Colunas marcadas como CIFRADO guardam base64 de AES-256-GCM feito na
-- aplicação. O Postgres nunca vê o conteúdo em claro.
create table if not exists public.registros (
  id             bigint generated always as identity primary key,
  protocolo      text not null unique,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  anonimo        boolean not null default true,
  nome           text,                                   -- CIFRADO
  setor          text,                                   -- CIFRADO
  motivos        jsonb not null default '[]'::jsonb,
  motivo_outro   text,                                   -- CIFRADO
  relato         text,                                   -- CIFRADO
  imediato       text,
  envolve        text,
  envolvido      text,                                   -- CIFRADO
  quer_contato   text,
  telefone       text,                                   -- CIFRADO
  email          text,                                   -- CIFRADO
  prioridade     text not null default 'normal'
                 check (prioridade in ('critica', 'alta', 'normal')),
  status         text not null default 'novo'
                 check (status in ('novo', 'em_acolhimento', 'encaminhado', 'concluido')),
  responsavel_id uuid references public.perfis(id) on delete set null,
  ip_hash        text                                    -- só a impressão, nunca o IP
);

create index if not exists idx_registros_status     on public.registros (status);
create index if not exists idx_registros_criado     on public.registros (criado_em desc);
create index if not exists idx_registros_prioridade on public.registros (prioridade, criado_em desc);

-- ----------------------------------------------------------------- notas
create table if not exists public.notas (
  id            bigint generated always as identity primary key,
  registro_id   bigint not null references public.registros(id) on delete cascade,
  usuario_id    uuid references public.perfis(id) on delete set null,
  texto         text not null,                           -- CIFRADO
  visivel_autor boolean not null default false,          -- true = a pessoa lê pelo protocolo
  -- true = escrita pela própria pessoa pelo protocolo (usuario_id fica nulo).
  de_autor      boolean not null default false,
  criado_em     timestamptz not null default now()
);

-- Migração para bancos criados antes da resposta do autor.
alter table public.notas
  add column if not exists de_autor boolean not null default false;

create index if not exists idx_notas_registro on public.notas (registro_id, criado_em);

-- ------------------------------------------------------------- auditoria
create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  usuario_id  uuid references public.perfis(id) on delete set null,
  acao        text not null,
  registro_id bigint,
  detalhe     text,
  ip_hash     text,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_auditoria_criado on public.auditoria (criado_em desc);

-- --------------------------------------------------------------- limites
-- Contador de requisições. Em ambiente sem servidor não existe memória
-- compartilhada entre instâncias, então o limite vive no banco.
create table if not exists public.limites (
  chave     text primary key,
  contagem  integer not null default 0,
  ate       timestamptz not null
);

create or replace function public.consumir_limite(
  p_chave text,
  p_max integer,
  p_segundos integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contagem integer;
begin
  -- O apelido "l" é necessário: dentro do ON CONFLICT DO UPDATE a linha
  -- existente não pode ser referenciada com o nome qualificado pelo schema.
  insert into public.limites as l (chave, contagem, ate)
       values (p_chave, 1, now() + make_interval(secs => p_segundos))
  on conflict (chave) do update
     set contagem = case when l.ate < now() then 1 else l.contagem + 1 end,
         ate      = case when l.ate < now()
                         then now() + make_interval(secs => p_segundos)
                         else l.ate end
  returning l.contagem into v_contagem;

  -- Limpeza oportunista das janelas vencidas.
  delete from public.limites where ate < now() - interval '1 day';

  return v_contagem <= p_max;
end;
$$;

-- ===================================================================
--  TRAVA DE ACESSO
--  RLS ligado + zero políticas = negado para anon e authenticated.
--  A service_role (só no servidor) ignora RLS por definição.
-- ===================================================================

alter table public.perfis    enable row level security;
alter table public.registros enable row level security;
alter table public.notas     enable row level security;
alter table public.auditoria enable row level security;
alter table public.limites   enable row level security;

-- Não usamos FORCE ROW LEVEL SECURITY: ele só afeta o dono da tabela e faria
-- o Table Editor do Supabase aparecer vazio, sem ganho — anon e authenticated
-- já estão barrados por privilégio e por RLS.

revoke all on public.perfis, public.registros, public.notas,
              public.auditoria, public.limites
  from anon, authenticated;

-- Atenção: o Postgres concede EXECUTE a PUBLIC em toda função nova, e PUBLIC
-- inclui anon e authenticated. Revogar só desses dois não adianta — a permissão
-- continua chegando por PUBLIC. Sem esta linha, qualquer pessoa com a chave
-- pública poderia chamar consumir_limite('envio:<IP da vítima>', ...) em loop e
-- impedir que alguém enviasse um pedido de ajuda.
revoke all on function public.consumir_limite(text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.consumir_limite(text, integer, integer)
  to service_role, postgres;

-- Mesma armadilha: USAGE no schema public é concedido a PUBLIC por padrão.
revoke usage on schema public from public, anon, authenticated;
grant usage on schema public to postgres, service_role;

-- Tabelas criadas depois não devem herdar acesso para as chaves públicas.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on functions from public, anon, authenticated;

-- Concedemos explicitamente à service_role em vez de confiar nas permissões
-- padrão do Supabase: assim o script funciona igual em qualquer projeto e não
-- quebra se esses padrões mudarem.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
