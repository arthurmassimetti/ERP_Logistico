// admin-usuarios — cria/lista/edita/reseta senha/exclui login (auth.users) + perfil.
// Roda no servidor do Supabase (Edge Function), nunca no navegador, porque
// precisa da chave secreta pra mexer em auth.users — essa chave não pode
// existir em código que roda no computador de quem usa o painel.
//
// Só quem já está logado como 'admin' consegue chamar isso (verificado abaixo).
//
// Deployado no Supabase com o nome "dynamic-processor" (nome sugerido pelo
// dashboard na hora do deploy) — é este arquivo que roda lá. Ver
// transportadora-demo/js/data-live.js (LIVE.criarUsuario/listarUsuarios/
// atualizarUsuario/resetarSenhaUsuario/excluirUsuario).
//
// body: { acao, ...campos }. Sem "acao" = "criar" (compatibilidade com quem
// já chamava esta função antes de existirem as outras ações).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://txiuruoglwxsrgzjkwwv.supabase.co";
const SECRET_KEY = Deno.env.get("SB_SECRET_KEY")!;

const PAPEIS_VALIDOS = ["admin", "financeiro", "operacional", "motorista"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return responder({}, 200);
  if (req.method !== "POST") return responder({ error: "Método não permitido." }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return responder({ error: "Não autenticado." }, 401);

  const admin = createClient(SUPABASE_URL, SECRET_KEY);

  // quem está chamando precisa ser um admin já logado
  const { data: sessao, error: erroSessao } = await admin.auth.getUser(token);
  if (erroSessao || !sessao?.user) return responder({ error: "Sessão inválida." }, 401);

  const { data: perfilQuemChama } = await admin
    .from("perfis").select("papel").eq("user_id", sessao.user.id).single();
  if (!perfilQuemChama || perfilQuemChama.papel !== "admin") {
    return responder({ error: "Só administradores podem gerenciar usuários." }, 403);
  }

  let corpo: any;
  try { corpo = await req.json(); } catch { return responder({ error: "Corpo da requisição inválido." }, 400); }
  corpo = corpo || {};
  const acao = corpo.acao || "criar";

  // ------------------------------------------------------------------ listar
  if (acao === "listar") {
    const { data: usuarios, error: erroUsuarios } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (erroUsuarios) return responder({ error: erroUsuarios.message }, 400);

    const { data: perfis, error: erroPerfis } = await admin.from("perfis").select("*");
    if (erroPerfis) return responder({ error: erroPerfis.message }, 400);

    const porUserId = new Map(perfis.map((p: any) => [p.user_id, p]));
    const lista = usuarios.users.map((u: any) => {
      const p = porUserId.get(u.id);
      return {
        user_id: u.id,
        email: u.email,
        criado_em: u.created_at,
        ultimo_acesso: u.last_sign_in_at,
        nome: p?.nome ?? null,
        papel: p?.papel ?? null,
        ativo: p?.ativo ?? null,
        motorista_id: p?.motorista_id ?? null,
        telefone: p?.telefone ?? null,
        cadastro_status: p?.cadastro_status ?? null,
        tem_perfil: !!p,
      };
    });
    return responder({ ok: true, usuarios: lista });
  }

  // ------------------------------------------------------------------ criar
  if (acao === "criar") {
    const { email, senha, nome, papel, motorista_id, novo_motorista } = corpo;
    if (!email || !senha || !nome || !papel) {
      return responder({ error: "Preencha email, senha, nome e papel." }, 400);
    }
    if (!PAPEIS_VALIDOS.includes(papel)) {
      return responder({ error: "Papel inválido. Use: " + PAPEIS_VALIDOS.join(", ") }, 400);
    }
    if (String(senha).length < 8) {
      return responder({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    }

    // motorista nasce junto com o acesso: se não veio um motorista_id (vínculo a
    // quem já existe sem login), e vieram dados de "novo_motorista", cria o
    // cadastro em motoristas primeiro. Nunca fica motorista sem login nem
    // login sem motorista — se algo falhar depois, os dois são desfeitos.
    let motoristaIdFinal: string | null = motorista_id || null;
    let motoristaCriadoId: string | null = null;

    if (papel === "motorista" && !motoristaIdFinal && novo_motorista) {
      const { data: novoMotorista, error: erroMotorista } = await admin.from("motoristas").insert({
        nome,
        cpf: novo_motorista.cpf || null,
        rg: novo_motorista.rg || null,
        telefone: novo_motorista.telefone || null,
        cnh: novo_motorista.cnh || null,
        cnh_categoria: novo_motorista.cnh_categoria || null,
        cnh_validade: novo_motorista.cnh_validade || null,
      }).select().single();
      if (erroMotorista) return responder({ error: erroMotorista.message }, 400);
      motoristaIdFinal = novoMotorista.id;
      motoristaCriadoId = novoMotorista.id;
    }

    const { data: novoUsuario, error: erroCriar } = await admin.auth.admin.createUser({
      email, password: senha, email_confirm: true,
    });
    if (erroCriar) {
      if (motoristaCriadoId) await admin.from("motoristas").delete().eq("id", motoristaCriadoId);
      return responder({ error: erroCriar.message }, 400);
    }

    const { error: erroPerfil } = await admin.from("perfis").insert({
      user_id: novoUsuario.user.id, nome, papel, motorista_id: motoristaIdFinal,
      criado_por: sessao.user.id,
    });
    if (erroPerfil) {
      // não deixa um login órfão (sem perfil) nem um motorista órfão (sem login) se algo falhar
      await admin.auth.admin.deleteUser(novoUsuario.user.id);
      if (motoristaCriadoId) await admin.from("motoristas").delete().eq("id", motoristaCriadoId);
      return responder({ error: erroPerfil.message }, 400);
    }

    return responder({ ok: true, user_id: novoUsuario.user.id, motorista_id: motoristaIdFinal });
  }

  // ------------------------------------------------------------------ atualizar
  if (acao === "atualizar") {
    const { user_id, nome, papel, ativo, motorista_id, telefone } = corpo;
    if (!user_id) return responder({ error: "Informe o usuário a editar." }, 400);
    if (papel && !PAPEIS_VALIDOS.includes(papel)) {
      return responder({ error: "Papel inválido. Use: " + PAPEIS_VALIDOS.join(", ") }, 400);
    }
    if (user_id === sessao.user.id && ativo === false) {
      return responder({ error: "Você não pode desativar o próprio acesso." }, 400);
    }

    const dados: Record<string, unknown> = {};
    if (nome !== undefined) dados.nome = nome;
    if (papel !== undefined) dados.papel = papel;
    if (ativo !== undefined) dados.ativo = ativo;
    if (motorista_id !== undefined) dados.motorista_id = motorista_id || null;
    if (telefone !== undefined) dados.telefone = telefone || null;
    if (!Object.keys(dados).length) return responder({ error: "Nada para atualizar." }, 400);

    const { error: erroUpdate } = await admin.from("perfis").update(dados).eq("user_id", user_id);
    if (erroUpdate) return responder({ error: erroUpdate.message }, 400);

    return responder({ ok: true });
  }

  // ------------------------------------------------------------- resetar_senha
  if (acao === "resetar_senha") {
    const { user_id, nova_senha } = corpo;
    if (!user_id || !nova_senha) return responder({ error: "Informe o usuário e a nova senha." }, 400);
    if (String(nova_senha).length < 8) {
      return responder({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    }
    const { error: erroSenha } = await admin.auth.admin.updateUserById(user_id, { password: nova_senha });
    if (erroSenha) return responder({ error: erroSenha.message }, 400);
    return responder({ ok: true });
  }

  // ------------------------------------------------------------------ excluir
  if (acao === "excluir") {
    const { user_id } = corpo;
    if (!user_id) return responder({ error: "Informe o usuário a excluir." }, 400);
    if (user_id === sessao.user.id) {
      return responder({ error: "Você não pode excluir o próprio acesso." }, 400);
    }

    const { error: erroExcluir } = await admin.auth.admin.deleteUser(user_id);
    if (!erroExcluir) return responder({ ok: true, modo: "excluido" });

    // fallback: algum vínculo de auditoria ainda bloqueia a exclusão física (ex.:
    // tabela nova, fora das 4 que o patch_014 já deixou "on delete set null") —
    // desativa a conta em vez de travar a operação.
    const { error: erroSoft } = await admin.auth.admin.deleteUser(user_id, true);
    if (erroSoft) return responder({ error: erroSoft.message }, 400);
    await admin.from("perfis").delete().eq("user_id", user_id);
    return responder({ ok: true, modo: "desativado_sem_excluir" });
  }

  return responder({ error: "Ação desconhecida: " + acao }, 400);
});
