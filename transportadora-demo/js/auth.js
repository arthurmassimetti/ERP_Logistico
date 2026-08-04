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

  /* cadastro_status + campos "comuns" (patch_017) — pra saber se precisa do primeiro acesso
     obrigatório (qualquer papel, não só motorista) e pra pré-preencher o formulário. */
  const CAMPOS_PERFIL =
    "nome,papel,ativo,cadastro_status,cpf,telefone,endereco,cidade,uf,cep,data_nascimento," +
    "contato_emergencia_nome,contato_emergencia_telefone";

  sb.auth.getSession().then(async ({ data }) => {
    if (!data.session) {
      location.replace("login.html");
      return;
    }

    const user = data.session.user;
    let rotulo = user.email || "usuário";
    let papel = "";
    let perfil = null;
    try {
      let r = await sb.from("perfis").select(CAMPOS_PERFIL).eq("user_id", user.id).single();
      if (r.error && r.error.code === "42703") {
        // banco ainda sem o patch_017 (colunas novas) — não bloqueia ninguém por causa disso,
        // só não oferece o primeiro acesso genérico até o patch rodar
        r = await sb.from("perfis").select("nome,papel,ativo").eq("user_id", user.id).single();
        if (r.data) r.data.cadastro_status = "completo";
      }
      perfil = r.data;
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

    document.documentElement.style.visibility = "";

    onReady(() => {
      const alvo = document.getElementById("user-box");
      if (alvo) {
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
      }

      if (perfil && papel) {
        if (perfil.cadastro_status && perfil.cadastro_status !== "completo") {
          // login novo (nasce 'pendente') — cadastro obrigatório antes de usar o painel
          window.abrirPrimeiroAcessoGeral(perfil, { bloqueante: true });
        } else {
          const faltaAlgumComum = ["telefone", "endereco", "contato_emergencia_nome", "contato_emergencia_telefone"]
            .some(c => !perfil[c]);
          if (faltaAlgumComum) mostrarLembreteCadastro(perfil);
        }
      }
    });
  });

  /* lembrete discreto, não bloqueante — pros perfis dispensados do cadastro obrigatório
     (grandfathering do patch_017) que ainda não preencheram os dados comuns */
  function mostrarLembreteCadastro(perfil) {
    onReady(() => {
      const rodape = document.querySelector(".sidebar-foot");
      const userBox = document.getElementById("user-box");
      if (!rodape || !userBox) return;
      const aviso = document.createElement("button");
      aviso.className = "btn-sair";
      aviso.style.cssText = "margin-top:6px;width:100%;text-align:center";
      aviso.textContent = "Completar cadastro →";
      aviso.onclick = () => window.abrirPrimeiroAcessoGeral(perfil, { bloqueante: false });
      rodape.insertBefore(aviso, userBox.nextSibling);
    });
  }
})();
