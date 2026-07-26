/* Tela de login — autentica no Supabase e envia para o painel */
(function () {
  const sb = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.publishableKey
  );

  /* já está logado? vai direto pro painel */
  sb.auth.getSession().then(({ data }) => {
    if (data.session) location.replace("index.html");
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
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) {
        mostrarErro(traduzErro(error));
        btnEntrar.disabled = false;
        btnEntrar.textContent = "Entrar";
        return;
      }
      location.replace("index.html");
    } catch (err) {
      mostrarErro(traduzErro(err));
      btnEntrar.disabled = false;
      btnEntrar.textContent = "Entrar";
    }
  };
})();
