/* Porteiro do painel — exige login (Supabase) para ver qualquer tela.
   Sem sessão -> redireciona para login.html.
   Com sessão -> libera a página e mostra usuário + botão Sair na sidebar. */
(function () {
  /* esconde a página até confirmar a sessão (evita "piscar" o painel p/ quem não logou) */
  document.documentElement.style.visibility = "hidden";

  const sb = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.publishableKey
  );
  window.sb = sb; /* disponível para as próximas fases (dados vivos) */

  const onReady = (fn) =>
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", fn)
      : fn();

  sb.auth.getSession().then(async ({ data }) => {
    if (!data.session) {
      location.replace("login.html");
      return;
    }
    document.documentElement.style.visibility = "";

    const user = data.session.user;
    let rotulo = user.email || "usuário";
    let papel = "";
    try {
      const { data: perfil } = await sb
        .from("perfis")
        .select("nome,papel,ativo")
        .eq("user_id", user.id)
        .single();
      if (perfil && perfil.ativo === false) {
        await sb.auth.signOut();
        location.replace("login.html?desativado=1");
        return;
      }
      if (perfil) { rotulo = perfil.nome; papel = perfil.papel; }
    } catch (_) { /* sem perfil cadastrado: mostra o e-mail mesmo */ }

    if (papel === "motorista") {
      // motorista não usa o painel administrativo — vai pro painel enxuto dele
      location.replace("motorista.html");
      return;
    }

    onReady(() => {
      const alvo = document.getElementById("user-box");
      if (!alvo) return;
      const linha = document.createElement("div");
      linha.className = "user-line";
      const b = document.createElement("b");
      b.textContent = rotulo;
      linha.appendChild(b);
      if (papel) linha.appendChild(document.createTextNode(" · " + papel));

      const btn = document.createElement("button");
      btn.className = "btn-sair";
      btn.textContent = "Sair";
      btn.onclick = async () => {
        btn.disabled = true;
        await sb.auth.signOut();
        location.replace("login.html");
      };

      alvo.replaceChildren(linha, btn);
    });
  });
})();
