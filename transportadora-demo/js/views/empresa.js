/* Dados da empresa — cadastro único (linha id=1), só admin lê/edita (RLS). */
(function () {
  const U = window.U;
  const state = { dados: null, erro: null };

  const CAMPOS = [
    "razao_social", "nome_fantasia", "cnpj", "inscricao_estadual", "inscricao_municipal", "rntrc",
    "endereco", "cidade", "uf", "cep", "telefone", "email", "responsavel_legal", "logo_url",
    "banco", "agencia", "conta", "pix", "comissao_padrao_frete",
  ];

  function view() {
    return `<div id="emp-corpo"><div class="empty">Carregando dados da empresa…</div></div>`;
  }

  function campo(id, rotulo, opts) {
    opts = opts || {};
    const valor = state.dados ? (state.dados[opts.campo || id] ?? "") : "";
    const tipo = opts.tipo || "text";
    return `<div class="${opts.full ? "full" : ""}"><label>${rotulo}</label>
      <input id="${id}" type="${tipo}" ${opts.step ? `step="${opts.step}" min="0"` : ""}
        value="${U.esc(valor)}" placeholder="${opts.placeholder || ""}"></div>`;
  }

  function formulario() {
    return `
    <div class="card card-pad">
      <div class="section-title" style="margin-top:0">Identificação</div>
      <div class="form-grid">
        ${campo("emp-razao", "Razão social", { full: true, campo: "razao_social" })}
        ${campo("emp-fantasia", "Nome fantasia", { campo: "nome_fantasia" })}
        ${campo("emp-cnpj", "CNPJ", { campo: "cnpj", placeholder: "00.000.000/0000-00" })}
        ${campo("emp-ie", "Inscrição estadual", { campo: "inscricao_estadual" })}
        ${campo("emp-im", "Inscrição municipal", { campo: "inscricao_municipal" })}
        ${campo("emp-rntrc", "RNTRC da empresa", { campo: "rntrc" })}
      </div>
    </div>

    <div class="card card-pad mt">
      <div class="section-title" style="margin-top:0">Endereço e contato</div>
      <div class="form-grid">
        ${campo("emp-endereco", "Endereço", { full: true, campo: "endereco" })}
        ${campo("emp-cidade", "Cidade", { campo: "cidade" })}
        ${campo("emp-uf", "UF", { campo: "uf" })}
        ${campo("emp-cep", "CEP", { campo: "cep" })}
        ${campo("emp-telefone", "Telefone", { campo: "telefone" })}
        ${campo("emp-email", "E-mail", { campo: "email", tipo: "email" })}
        ${campo("emp-responsavel", "Responsável legal", { campo: "responsavel_legal" })}
        ${campo("emp-logo", "URL do logo", { campo: "logo_url", placeholder: "https://…" })}
      </div>
    </div>

    <div class="card card-pad mt">
      <div class="section-title" style="margin-top:0">Dados bancários</div>
      <div class="form-grid">
        ${campo("emp-banco", "Banco", { campo: "banco" })}
        ${campo("emp-agencia", "Agência", { campo: "agencia" })}
        ${campo("emp-conta", "Conta", { campo: "conta" })}
        ${campo("emp-pix", "Chave PIX", { campo: "pix" })}
      </div>
    </div>

    <div class="card card-pad mt">
      <div class="section-title" style="margin-top:0">Parâmetros operacionais</div>
      <div class="form-grid">
        ${campo("emp-comissao", "Comissão padrão de frete (R$)", { campo: "comissao_padrao_frete", tipo: "number", step: "0.01" })}
      </div>
      <div class="legend-note mt">Valor sugerido automaticamente ao lançar um frete novo — pode ser alterado por frete.</div>
    </div>

    <div class="mt" style="display:flex;gap:8px">
      <button class="btn btn-primary" id="emp-salvar">Salvar alterações</button>
    </div>`;
  }

  function salvar() {
    document.getElementById("emp-salvar").onclick = async () => {
      const val = id => document.getElementById(id).value.trim();
      const payload = {
        razao_social: val("emp-razao") || null,
        nome_fantasia: val("emp-fantasia") || null,
        cnpj: val("emp-cnpj") || null,
        inscricao_estadual: val("emp-ie") || null,
        inscricao_municipal: val("emp-im") || null,
        rntrc: val("emp-rntrc") || null,
        endereco: val("emp-endereco") || null,
        cidade: val("emp-cidade") || null,
        uf: val("emp-uf") || null,
        cep: val("emp-cep") || null,
        telefone: val("emp-telefone") || null,
        email: val("emp-email") || null,
        responsavel_legal: val("emp-responsavel") || null,
        logo_url: val("emp-logo") || null,
        banco: val("emp-banco") || null,
        agencia: val("emp-agencia") || null,
        conta: val("emp-conta") || null,
        pix: val("emp-pix") || null,
        comissao_padrao_frete: parseFloat(val("emp-comissao")) || 0,
      };
      const btn = document.getElementById("emp-salvar");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        state.dados = await LIVE.atualizarEmpresa(payload);
        U.toast("Dados da empresa atualizados.");
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
      } finally {
        btn.disabled = false; btn.textContent = "Salvar alterações";
      }
    };
  }

  async function carregar() {
    const alvo = document.getElementById("emp-corpo");
    try {
      state.dados = await LIVE.empresa();
      state.erro = null;
    } catch (e) {
      state.dados = null;
      const msg = (e.message || String(e)).toLowerCase();
      state.erro = msg.includes("permission") || msg.includes("row-level")
        ? "Acesso restrito a administradores."
        : "Não foi possível carregar os dados da empresa: " + (e.message || e);
    }
    if (state.erro) {
      alvo.innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`;
      return;
    }
    alvo.innerHTML = formulario();
    salvar();
  }

  function bind() {
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.empresa = {
    title: "Dados da empresa",
    sub: "Cadastro, contato, dados bancários e parâmetros operacionais",
    render: view, bind,
  };
})();
