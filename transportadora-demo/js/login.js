/* Tela de login — autentica no Supabase e envia para o painel */
(function () {
  const sb = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.publishableKey
  );

  /* motorista vai direto pro portal dele — nunca passa pelo painel administrativo.
     Qualquer outro papel (ou erro/sem perfil) cai no painel, como sempre. */
  async function destinoPorPapel(userId) {
    try {
      const { data: perfil } = await sb.from("perfis").select("papel").eq("user_id", userId).single();
      return perfil && perfil.papel === "motorista" ? "motorista.html" : "index.html";
    } catch (_) {
      return "index.html";
    }
  }

  /* já está logado? vai direto pro destino certo */
  sb.auth.getSession().then(async ({ data }) => {
    if (data.session) location.replace(await destinoPorPapel(data.session.user.id));
  });

  const form = document.getElementById("form-login");
  const inpEmail = document.getElementById("email");
  const inpSenha = document.getElementById("senha");
  const btnVer = document.getElementById("btn-ver");
  const btnEntrar = document.getElementById("btn-entrar");
  const boxErro = document.getElementById("login-erro");

  btnVer.onclick = () => {
    const oculta = inpSenha.type === "password";
    inpSenha.type = oculta ? "text" : "password";
    btnVer.textContent = oculta ? "ocultar" : "mostrar";
    inpSenha.focus();
  };

  function mostrarErro(msg) {
    boxErro.textContent = msg;
    boxErro.hidden = false;
  }

  function traduzErro(error) {
    const m = (error && error.message || "").toLowerCase();
    if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
    if (m.includes("email not confirmed")) return "E-mail ainda não confirmado. Fale com o administrador.";
    if (m.includes("failed to fetch") || m.includes("network")) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde um instante e tente de novo.";
    return "Não foi possível entrar. Tente novamente.";
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    boxErro.hidden = true;

    const email = inpEmail.value.trim();
    const senha = inpSenha.value;
    if (!email || !senha) { mostrarErro("Preencha e-mail e senha."); return; }

    btnEntrar.disabled = true;
    btnEntrar.textContent = "Entrando…";
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) {
        mostrarErro(traduzErro(error));
        btnEntrar.disabled = false;
        btnEntrar.textContent = "Entrar";
        return;
      }
      location.replace(await destinoPorPapel(data.user.id));
    } catch (err) {
      mostrarErro(traduzErro(err));
      btnEntrar.disabled = false;
      btnEntrar.textContent = "Entrar";
    }
  };
})();
