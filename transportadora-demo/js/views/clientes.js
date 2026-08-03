/* Clientes (transportadoras/agenciadores que pagam o frete) — cadastro com CNPJ,
   prazo de pagamento e contato. Nunca exclui, só ativa/desativa (mesmo espírito
   de categorias_carga), pra não perder o vínculo com fretes que já usam ele. */
(function () {
  const U = window.U;
  const state = { clientes: [], erro: null };

  function view() {
    return `
    <div class="section-title" style="margin-top:0">Clientes cadastrados <span class="count-pill" id="cli-count"></span></div>
    <div id="cli-lista"><div class="empty">Carregando…</div></div>
    <div class="mt"><button class="btn btn-primary" id="btn-novo-cliente" disabled>+ Novo cliente</button></div>
    <div class="legend-note">Clientes nunca são excluídos — só ativados/desativados, pra não perder o vínculo com fretes que já usam eles. Clientes inativos somem do formulário de novo frete, mas continuam aparecendo nos fretes antigos.</div>`;
  }

  function lista() {
    const cs = [...state.clientes].sort((a, b) => a.nome.localeCompare(b.nome));
    document.getElementById("cli-count").textContent = `${cs.filter(c => c.ativo).length} ativos de ${cs.length}`;
    if (!cs.length) {
      document.getElementById("cli-lista").innerHTML = '<div class="empty">Nenhum cliente cadastrado ainda.</div>';
      return;
    }
    document.getElementById("cli-lista").innerHTML = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Cliente</th><th>CNPJ</th><th>Prazo</th><th>Contato</th><th>Situação</th><th></th></tr></thead>
        <tbody>${cs.map(c => `
          <tr>
            <td class="td-main">${U.esc(c.nome)}</td>
            <td class="mono">${U.esc(c.cnpj || "—")}</td>
            <td>${c.prazo_pagamento_dias ? c.prazo_pagamento_dias + " dias" : "—"}</td>
            <td>${U.esc(c.contato_nome || "—")}${c.contato_telefone ? " · " + U.esc(c.contato_telefone) : ""}</td>
            <td>${c.ativo ? '<span class="tag tag-ok">ativo</span>' : '<span class="tag tag-neutro">inativo</span>'}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-sm btn-ghost" data-editar="${c.id}">editar</button>
              <button class="btn btn-sm btn-ghost" data-toggle="${c.id}">${c.ativo ? "desativar" : "reativar"}</button>
            </td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
    document.querySelectorAll("[data-editar]").forEach(b => b.onclick = () => formCliente(state.clientes.find(c => c.id === b.dataset.editar)));
    document.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => toggleAtivo(b.dataset.toggle));
  }

  async function toggleAtivo(id) {
    const c = state.clientes.find(x => x.id === id);
    if (!c) return;
    try {
      const upd = await LIVE.atualizarCliente(id, { ativo: !c.ativo });
      Object.assign(c, upd);
      lista();
      U.toast(c.ativo ? "Cliente reativado." : "Cliente desativado.");
    } catch (e) {
      U.toast("Erro: " + (e.message || e));
    }
  }

  function formCliente(existente) {
    const ed = !!existente;
    const g = (c, d) => ed ? (existente[c] ?? d) : d;
    U.openDrawer({
      titulo: ed ? "Editar cliente" : "Novo cliente",
      sub: ed ? "Altere os campos e salve." : "Lançamento gravado direto no banco.",
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Nome<span class="req">*</span></label><input id="cl-nome" value="${U.esc(g("nome", ""))}" placeholder="ex.: ROCHAPAN"></div>
        <div><label>CNPJ</label><input id="cl-cnpj" value="${U.esc(g("cnpj", "") || "")}" placeholder="00.000.000/0000-00"></div>
        <div><label>Prazo de pagamento (dias)</label><input type="number" id="cl-prazo" min="0" value="${g("prazo_pagamento_dias", "") ?? ""}"></div>
        <div><label>Contato — nome</label><input id="cl-contato-nome" value="${U.esc(g("contato_nome", "") || "")}"></div>
        <div><label>Contato — telefone</label><input id="cl-contato-tel" value="${U.esc(g("contato_telefone", "") || "")}"></div>
        <div class="full"><label>Contato — e-mail</label><input type="email" id="cl-contato-email" value="${U.esc(g("contato_email", "") || "")}"></div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório</div>
      </div>`,
      rodape: `
        <button class="btn" id="cl-cancel">Cancelar</button>
        <button class="btn btn-primary" id="cl-save">${ed ? "Salvar alterações" : "Criar cliente"}</button>`,
    });
    document.getElementById("cl-cancel").onclick = U.closeDrawer;
    document.getElementById("cl-save").onclick = async () => {
      const val = id => document.getElementById(id).value.trim();
      const nome = val("cl-nome");
      if (!nome) { U.toast("Digite o nome do cliente."); return; }
      const payload = {
        nome: nome.toUpperCase(),
        cnpj: val("cl-cnpj") || null,
        prazo_pagamento_dias: val("cl-prazo") ? parseInt(val("cl-prazo"), 10) : null,
        contato_nome: val("cl-contato-nome") || null,
        contato_telefone: val("cl-contato-tel") || null,
        contato_email: val("cl-contato-email") || null,
      };
      const btn = document.getElementById("cl-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const salvo = ed
          ? await LIVE.atualizarCliente(existente.id, payload)
          : await LIVE.criarCliente(payload);
        if (ed) Object.assign(existente, salvo); else state.clientes.push(salvo);
        lista();
        U.closeDrawer();
        U.toast(ed ? "Cliente atualizado." : "Cliente criado.");
      } catch (e) {
        const msg = (e.message || "").toLowerCase().includes("duplicate") || (e.message || "").toLowerCase().includes("idx_clientes_nome_unico")
          ? "Já existe um cliente com esse nome."
          : "Erro ao salvar: " + (e.message || e);
        U.toast(msg);
        btn.disabled = false; btn.textContent = ed ? "Salvar alterações" : "Criar cliente";
      }
    };
  }

  async function carregar() {
    try {
      state.clientes = await LIVE.todosClientes();
      state.erro = null;
    } catch (e) {
      state.clientes = [];
      state.erro = "Não foi possível carregar os clientes: " + (e.message || e);
    }
    document.getElementById("btn-novo-cliente").disabled = false;
    if (state.erro) {
      document.getElementById("cli-lista").innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`;
      return;
    }
    lista();
  }

  function bind() {
    document.getElementById("btn-novo-cliente").onclick = () => formCliente(null);
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.clientes = {
    title: "Clientes",
    sub: "Cadastro de transportadoras/agenciadores, CNPJ, prazo e contato",
    render: view, bind,
  };
})();
