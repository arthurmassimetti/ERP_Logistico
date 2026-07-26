// admin-usuarios — cria login (auth.users) + perfil com nível de permissão.
// Roda no servidor do Supabase (Edge Function), nunca no navegador, porque
// precisa da chave secreta pra criar usuários — essa chave não pode existir
// em código que roda no computador de quem usa o painel.
//
// Só quem já está logado como 'admin' consegue chamar isso (verificado abaixo).

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
    return responder({ error: "Só administradores podem criar usuários." }, 403);
  }

  let corpo: any;
  try { corpo = await req.json(); } catch { return responder({ error: "Corpo da requisição inválido." }, 400); }

  const { email, senha, nome, papel, motorista_id } = corpo || {};
  if (!email || !senha || !nome || !papel) {
    return responder({ error: "Preencha email, senha, nome e papel." }, 400);
  }
  if (!PAPEIS_VALIDOS.includes(papel)) {
    return responder({ error: "Papel inválido. Use: " + PAPEIS_VALIDOS.join(", ") }, 400);
  }
  if (String(senha).length < 8) {
    return responder({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
  }

  const { data: novoUsuario, error: erroCriar } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
  });
  if (erroCriar) return responder({ error: erroCriar.message }, 400);

  const { error: erroPerfil } = await admin.from("perfis").insert({
    user_id: novoUsuario.user.id, nome, papel, motorista_id: motorista_id || null,
  });
  if (erroPerfil) {
    // não deixa um login órfão (sem perfil) se o segundo passo falhar
    await admin.auth.admin.deleteUser(novoUsuario.user.id);
    return responder({ error: erroPerfil.message }, 400);
  }

  return responder({ ok: true, user_id: novoUsuario.user.id });
});
