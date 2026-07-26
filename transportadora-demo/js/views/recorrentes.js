/* Contas recorrentes — contas fixas mensais (aluguel, financiamento, mensalidades...).
   Cada uma gera o mesmo lançamento todo mês, no dia configurado — cadastro único,
   sem redigitar todo mês. Dados vivos do Supabase. */
(function () {
  const U = window.U;

  const state = {
    fixas: [], origemFiltro: "", mostrarInativas: false, erro: null,
  };

  function view() {
    return `
    <div class="kpi-grid" id="rx-kpis"><div class="empty">Carregando…</div></div>

    <div class="filters">
      <div class="field"><label>Origem</label><select id="rx-origem">
        <option value="">todas</option>
        <option value="empresa">empresa</option>
        <option value="pessoal">pessoal</option>
      </select></div>
      <div class="field"><label>&nbsp;</label><label class="check-inline"><input type="checkbox" id="rx-inativas"> mostrar inativas</label></div>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="btn-nova-fixa" disabled>+ Nova conta recorrente</button>
    </div>
    <div id="rx-tbl"><div class="empty">Carregando contas recorrentes…</div></div>
    <div class="legend-note">Cada conta aqui gera o mesmo lançamento todo mês, no dia configurado — não precisa recadastrar. Os lançamentos do mês aparecem em Contas a pagar junto com as avulsas.</div>`;
  }

  function kpis() {
    const ativas = state.fixas.filter(f => f.ativa);
    const pes = ativas.filter(f => f.origem === "pessoal");
    const emp = ativas.filter(f => f.origem === "empresa");
    document.getElementById("rx-kpis").innerHTML = `
      <div class="kpi"><div class="kpi-label">${U.icons.wallet} Total por mês</div>
        <div class="kpi-value neg">${U.money(U.sum(ativas, f => f.valor))}</div>
        <div class="kpi-sub">${ativas.length} conta(s) ativa(s)</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.cash} Empresa</div>
        <div class="kpi-value">${U.money(U.sum(emp, f => f.valor))}</div>
        <div class="kpi-sub">${emp.length} conta(s)</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.users} Pessoal</div>
        <div class="kpi-value">${U.money(U.sum(pes, f => f.valor))}</div>
        <div class="kpi-sub">${pes.length} conta(s)</div></div>`;
  }

  function filtradas() {
    return state.fixas.filter(f => {
      if (!state.mostrarInativas && !f.ativa) return false;
      if (state.origemFiltro && f.origem !== state.origemFiltro) return false;
      return true;
    });
  }

  function tabela() {
    const fs = filtradas().sort((a, b) => a.dia_venc - b.dia_venc);
    if (!fs.length) {
      document.getElementById("rx-tbl").innerHTML = '<div class="empty">Nenhuma conta para os filtros.</div>';
      return;
    }
    document.getElementById("rx-tbl").innerHTML = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Descrição</th><th>Dia</th><th>Origem</th><th>Forma</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
        <tbody>${fs.map(f => `
          <tr style="${!f.ativa ? "opacity:.55" : ""}">
            <td class="td-main">${U.esc(f.descricao)}
              ${f.data_fim ? `<div class="td-sub">até ${U.dBR(f.data_fim)}</div>` : ""}</td>
            <td>dia ${f.dia_venc}</td>
            <td>${f.origem === "pessoal" ? '<span class="tag tag-info">pessoal</span>' : '<span class="tag tag-neutro">empresa</span>'}</td>
            <td>${U.esc(f.forma_pagto || "—")}</td>
            <td class="num">${U.money(f.valor)}</td>
            <td>${f.ativa ? '<span class="tag tag-ok">ativa</span>' : '<span class="tag tag-neutro">inativa</span>'}
              ${f.pendente ? '<div class="td-sub">confirmar manual</div>' : ""}</td>
            <td><button class="btn btn-sm btn-ghost" data-toggle="${f.id}">${f.ativa ? "desativar" : "reativar"}</button></td>
          </tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="4">Total ${state.mostrarInativas ? "" : "ativas"}</td><td class="num">${U.money(U.sum(fs, f => f.valor))}</td><td colspan="2"></td></tr></tfoot>
      </table></div>`;
    document.querySelectorAll("[data-toggle]").forEach(b => b.onclick = async () => {
      const id = b.dataset.toggle;
      const f = state.fixas.find(x => x.id === id);
      b.disabled = true;
      try {
        const upd = await LIVE.atualizarContaFixa(id, { ativa: !f.ativa });
        Object.assign(f, upd);
        kpis(); tabela();
        U.toast(f.ativa ? "Conta reativada." : "Conta desativada.");
      } catch (e) {
        U.toast("Erro: " + (e.message || e));
        b.disabled = false;
      }
    });
  }

  function formNova() {
    U.openDrawer({
      titulo: "Nova conta recorrente",
      sub: "Gera o mesmo lançamento todo mês, no dia informado.",
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Descrição<span class="req">*</span></label><input id="nx-desc" placeholder="ex.: ALUGUEL GALPÃO"></div>
        <div><label>Valor (R$)<span class="req">*</span></label><input type="number" step="0.01" min="0" id="nx-valor"></div>
        <div><label>Dia do vencimento<span class="req">*</span></label><input type="number" min="1" max="31" id="nx-dia" value="10"></div>
        <div><label>Origem</label><select id="nx-origem"><option value="empresa">empresa</option><option value="pessoal">pessoal</option></select></div>
        <div><label>Forma</label><input id="nx-forma" placeholder="ex.: BOLETO, PIX, DEB AUTO"></div>
        <div class="full"><label>Termina em (opcional, p/ parcelado)</label><input type="date" id="nx-fim"></div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório</div>
      </div>`,
      rodape: `
        <button class="btn" id="nx-cancel">Cancelar</button>
        <button class="btn btn-primary" id="nx-save">Criar conta recorrente</button>`,
    });
    document.getElementById("nx-cancel").onclick = U.closeDrawer;
    document.getElementById("nx-save").onclick = async () => {
      const desc = document.getElementById("nx-desc").value.trim();
      const valor = parseFloat(document.getElementById("nx-valor").value) || 0;
      const dia = parseInt(document.getElementById("nx-dia").value, 10);
      if (!desc || valor <= 0 || !dia || dia < 1 || dia > 31) { U.toast("Preencha descrição, valor e um dia válido (1-31)."); return; }
      const fim = document.getElementById("nx-fim").value;
      const payload = {
        descricao: desc.toUpperCase(), valor, dia_venc: dia,
        origem: document.getElementById("nx-origem").value,
        forma_pagto: document.getElementById("nx-forma").value.trim().toUpperCase() || null,
        recorrencia: fim ? "PARCELADO" : "MENSAL",
        data_fim: fim || null,
        ativa: true,
      };
      const btn = document.getElementById("nx-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const criado = await LIVE.criarContaFixa(payload);
        state.fixas.push(criado);
        kpis(); tabela();
        U.closeDrawer();
        U.toast("Conta recorrente criada.");
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Criar conta recorrente";
      }
    };
  }

  async function carregar() {
    try {
      state.fixas = await LIVE.contasFixas();
      state.erro = null;
    } catch (e) {
      state.erro = "Não foi possível carregar as contas recorrentes: " + (e.message || e);
    }
    document.getElementById("btn-nova-fixa").disabled = false;
    if (state.erro) {
      document.getElementById("rx-kpis").innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`;
      document.getElementById("rx-tbl").innerHTML = "";
      return;
    }
    kpis(); tabela();
  }

  function bind() {
    document.getElementById("rx-origem").onchange = e => { state.origemFiltro = e.target.value; tabela(); };
    document.getElementById("rx-inativas").onchange = e => { state.mostrarInativas = e.target.checked; tabela(); };
    document.getElementById("btn-nova-fixa").onclick = formNova;
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.recorrentes = {
    title: "Contas recorrentes",
    sub: "Contas fixas mensais — geram o mesmo lançamento todo mês",
    render: view, bind,
  };
})();
