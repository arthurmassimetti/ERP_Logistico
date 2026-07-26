/* Categoria de carga — cadastro simples (nome + exige seguro especial). Nunca exclui, só ativa/desativa. */
(function () {
  const U = window.U;
  const state = { categorias: [], erro: null };

  function view() {
    return `
    <div class="section-title" style="margin-top:0">Categorias cadastradas <span class="count-pill" id="cat-count"></span></div>
    <div id="cat-lista"><div class="empty">Carregando…</div></div>
    <div class="mt"><button class="btn btn-primary" id="btn-nova-categoria" disabled>+ Nova categoria</button></div>
    <div class="legend-note">Categorias nunca são excluídas — só ativadas/desativadas, pra não perder o vínculo com fretes que já usam ela. Categorias inativas somem do formulário de novo frete, mas continuam aparecendo nos fretes antigos.</div>`;
  }

  function lista() {
    const cs = [...state.categorias].sort((a, b) => a.nome.localeCompare(b.nome));
    document.getElementById("cat-count").textContent = `${cs.filter(c => c.ativa).length} ativas de ${cs.length}`;
    if (!cs.length) {
      document.getElementById("cat-lista").innerHTML = '<div class="empty">Nenhuma categoria cadastrada ainda.</div>';
      return;
    }
    document.getElementById("cat-lista").innerHTML = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Categoria</th><th>Seguro especial</th><th>Situação</th><th></th></tr></thead>
        <tbody>${cs.map(c => `
          <tr>
            <td class="td-main">${U.esc(c.nome)}</td>
            <td>${c.exige_seguro_especial ? '<span class="tag tag-warn">exige</span>' : '<span class="muted">—</span>'}</td>
            <td>${c.ativa ? '<span class="tag tag-ok">ativa</span>' : '<span class="tag tag-neutro">inativa</span>'}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-sm btn-ghost" data-editar="${c.id}">editar</button>
              <button class="btn btn-sm btn-ghost" data-toggle="${c.id}">${c.ativa ? "desativar" : "reativar"}</button>
            </td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
    document.querySelectorAll("[data-editar]").forEach(b => b.onclick = () => formCategoria(state.categorias.find(c => c.id === b.dataset.editar)));
    document.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => toggleAtiva(b.dataset.toggle));
  }

  async function toggleAtiva(id) {
    const c = state.categorias.find(x => x.id === id);
    if (!c) return;
    try {
      const upd = await LIVE.atualizarCategoriaCarga(id, { ativa: !c.ativa });
      Object.assign(c, upd);
      lista();
      U.toast(c.ativa ? "Categoria reativada." : "Categoria desativada.");
    } catch (e) {
      U.toast("Erro: " + (e.message || e));
    }
  }

  function formCategoria(existente) {
    const ed = !!existente;
    U.openDrawer({
      titulo: ed ? "Editar categoria" : "Nova categoria de carga",
      sub: ed ? "Altere os campos e salve." : "Lançamento gravado direto no banco.",
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Nome<span class="req">*</span></label><input id="ct-nome" value="${ed ? U.esc(existente.nome) : ""}" placeholder="ex.: Carga Refrigerada"></div>
        <div class="full"><label class="check-inline"><input type="checkbox" id="ct-seguro" ${ed && existente.exige_seguro_especial ? "checked" : ""}> exige seguro especial (perigosa, viva, indivisível…)</label></div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório</div>
      </div>`,
      rodape: `
        <button class="btn" id="ct-cancel">Cancelar</button>
        <button class="btn btn-primary" id="ct-save">${ed ? "Salvar alterações" : "Criar categoria"}</button>`,
    });
    document.getElementById("ct-cancel").onclick = U.closeDrawer;
    document.getElementById("ct-save").onclick = async () => {
      const nome = document.getElementById("ct-nome").value.trim();
      if (!nome) { U.toast("Digite um nome pra categoria."); return; }
      const payload = { nome, exige_seguro_especial: document.getElementById("ct-seguro").checked };
      const btn = document.getElementById("ct-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const salvo = ed
          ? await LIVE.atualizarCategoriaCarga(existente.id, payload)
          : await LIVE.criarCategoriaCarga(payload);
        if (ed) Object.assign(existente, salvo); else state.categorias.push(salvo);
        lista();
        U.closeDrawer();
        U.toast(ed ? "Categoria atualizada." : "Categoria criada.");
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = ed ? "Salvar alterações" : "Criar categoria";
      }
    };
  }

  async function carregar() {
    try {
      state.categorias = await LIVE.todasCategoriasCarga();
      state.erro = null;
    } catch (e) {
      state.categorias = [];
      state.erro = "Não foi possível carregar as categorias: " + (e.message || e);
    }
    document.getElementById("btn-nova-categoria").disabled = false;
    if (state.erro) {
      document.getElementById("cat-lista").innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`;
      return;
    }
    lista();
  }

  function bind() {
    document.getElementById("btn-nova-categoria").onclick = () => formCategoria(null);
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.categorias = {
    title: "Categoria de carga",
    sub: "Cadastro de tipos de carga usados nos fretes",
    render: view, bind,
  };
})();
