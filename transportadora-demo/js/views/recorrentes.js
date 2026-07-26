/* Contas fixas mensais (aluguel, financiamento, mensalidades...). Cada uma gera o
   mesmo lançamento todo mês, no dia configurado — cadastro único, sem redigitar.

   São DUAS telas geradas por este mesmo arquivo, separadas por origem:
     #/recorrentes           -> contas fixas da EMPRESA
     #/recorrentes-pessoal   -> contas fixas PESSOAIS do sócio

   A separação é só de visualização; a tabela no banco continua sendo uma só
   (contas_fixas, coluna origem). Quem tem papel 'financeiro' não enxerga as
   pessoais por regra de RLS — a tela avisa em vez de parecer quebrada. */
(function () {
  const U = window.U;

  function criarTela(origem, cfg) {
    const state = { fixas: [], mostrarInativas: false, erro: null };
    const id = (n) => `rx-${origem}-${n}`;   // ids únicos por tela

    function view() {
      return `
      <div class="kpi-grid" id="${id("kpis")}"><div class="empty">Carregando…</div></div>

      <div class="filters">
        <div class="field"><label>&nbsp;</label><label class="check-inline">
          <input type="checkbox" id="${id("inativas")}"> mostrar inativas</label></div>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="${id("nova")}" disabled>+ Nova conta ${cfg.substantivo}</button>
      </div>
      <div id="${id("tbl")}"><div class="empty">Carregando…</div></div>
      <div class="legend-note">${cfg.rodape}</div>`;
    }

    function kpis() {
      const ativas = state.fixas.filter(f => f.ativa);
      const inativas = state.fixas.filter(f => !f.ativa);
      const total = U.sum(ativas, f => f.valor);
      document.getElementById(id("kpis")).innerHTML = `
        <div class="kpi"><div class="kpi-label">${U.icons.wallet} Total por mês</div>
          <div class="kpi-value neg">${U.money(total)}</div>
          <div class="kpi-sub">${ativas.length} conta(s) ativa(s)</div></div>
        <div class="kpi"><div class="kpi-label">${U.icons.cash} Média por conta</div>
          <div class="kpi-value">${U.money(ativas.length ? total / ativas.length : 0)}</div>
          <div class="kpi-sub">${cfg.rotulo.toLowerCase()}</div></div>
        <div class="kpi"><div class="kpi-label">${U.icons.calendar} No ano</div>
          <div class="kpi-value">${U.money(total * 12)}</div>
          <div class="kpi-sub">projeção de 12 meses</div></div>
        <div class="kpi"><div class="kpi-label">${U.icons.doc} Desativadas</div>
          <div class="kpi-value">${inativas.length}</div>
          <div class="kpi-sub">fora do cálculo</div></div>`;
    }

    function tabela() {
      const fs = state.fixas
        .filter(f => state.mostrarInativas || f.ativa)
        .sort((a, b) => a.dia_venc - b.dia_venc);

      if (!fs.length) {
        document.getElementById(id("tbl")).innerHTML =
          `<div class="empty">${state.fixas.length
            ? "Nenhuma conta ativa. Marque “mostrar inativas” para ver as desativadas."
            : cfg.vazio}</div>`;
        return;
      }

      document.getElementById(id("tbl")).innerHTML = `
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Descrição</th><th>Dia</th><th>Forma</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>${fs.map(f => `
            <tr style="${!f.ativa ? "opacity:.55" : ""}">
              <td class="td-main">${U.esc(f.descricao)}
                ${f.data_fim ? `<div class="td-sub">até ${U.dBR(f.data_fim)}</div>` : ""}</td>
              <td>dia ${f.dia_venc}</td>
              <td>${U.esc(f.forma_pagto || "—")}</td>
              <td class="num">${U.money(f.valor)}</td>
              <td>${f.ativa ? '<span class="tag tag-ok">ativa</span>' : '<span class="tag tag-neutro">inativa</span>'}
                ${f.pendente ? '<div class="td-sub">confirmar manual</div>' : ""}</td>
              <td><button class="btn btn-sm btn-ghost" data-toggle="${f.id}">${f.ativa ? "desativar" : "reativar"}</button></td>
            </tr>`).join("")}</tbody>
          <tfoot><tr><td colspan="3">Total ${state.mostrarInativas ? "" : "ativas"}</td>
            <td class="num">${U.money(U.sum(fs, f => f.valor))}</td><td colspan="2"></td></tr></tfoot>
        </table></div>`;

      document.querySelectorAll(`#${id("tbl")} [data-toggle]`).forEach(b => b.onclick = async () => {
        const f = state.fixas.find(x => x.id === b.dataset.toggle);
        b.disabled = true;
        try {
          const upd = await LIVE.atualizarContaFixa(f.id, { ativa: !f.ativa });
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
        titulo: `Nova conta fixa — ${cfg.rotulo.toLowerCase()}`,
        sub: "Gera o mesmo lançamento todo mês, no dia informado.",
        corpo: `
        <div class="form-grid">
          <div class="full"><label>Descrição<span class="req">*</span></label><input id="${id("desc")}" placeholder="${cfg.exemplo}"></div>
          <div><label>Valor (R$)<span class="req">*</span></label><input type="number" step="0.01" min="0" id="${id("valor")}"></div>
          <div><label>Dia do vencimento<span class="req">*</span></label><input type="number" min="1" max="31" id="${id("dia")}" value="10"></div>
          <div class="full"><label>Forma</label><input id="${id("forma")}" placeholder="ex.: BOLETO, PIX, DEB AUTO"></div>
          <div class="full"><label>Termina em (opcional, p/ parcelado)</label><input type="date" id="${id("fim")}"></div>
          <div class="full form-note"><span class="req">*</span> campo obrigatório ·
            será criada como conta <b>${cfg.rotulo.toLowerCase()}</b></div>
        </div>`,
        rodape: `
          <button class="btn" id="${id("cancel")}">Cancelar</button>
          <button class="btn btn-primary" id="${id("save")}">Criar conta</button>`,
      });
      document.getElementById(id("cancel")).onclick = U.closeDrawer;
      document.getElementById(id("save")).onclick = async () => {
        const desc = document.getElementById(id("desc")).value.trim();
        const valor = parseFloat(document.getElementById(id("valor")).value) || 0;
        const dia = parseInt(document.getElementById(id("dia")).value, 10);
        if (!desc || valor <= 0 || !dia || dia < 1 || dia > 31) {
          U.toast("Preencha descrição, valor e um dia válido (1-31)."); return;
        }
        const fim = document.getElementById(id("fim")).value;
        const payload = {
          descricao: desc.toUpperCase(), valor, dia_venc: dia,
          origem,                                   // fixado pela tela, não escolhido
          forma_pagto: document.getElementById(id("forma")).value.trim().toUpperCase() || null,
          recorrencia: fim ? "PARCELADO" : "MENSAL",
          data_fim: fim || null,
          ativa: true,
        };
        const btn = document.getElementById(id("save"));
        btn.disabled = true; btn.textContent = "Salvando…";
        try {
          const criado = await LIVE.criarContaFixa(payload);
          state.fixas.push(criado);
          kpis(); tabela();
          U.closeDrawer();
          U.toast("Conta fixa criada.");
        } catch (e) {
          U.toast("Erro ao salvar: " + (e.message || e));
          btn.disabled = false; btn.textContent = "Criar conta";
        }
      };
    }

    async function carregar() {
      try {
        const todas = await LIVE.contasFixas();
        state.fixas = todas.filter(f => f.origem === origem);
        state.erro = null;
      } catch (e) {
        state.erro = "Não foi possível carregar as contas fixas: " + (e.message || e);
      }
      document.getElementById(id("nova")).disabled = false;
      if (state.erro) {
        document.getElementById(id("kpis")).innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`;
        document.getElementById(id("tbl")).innerHTML = "";
        return;
      }
      kpis(); tabela();
    }

    function bind() {
      document.getElementById(id("inativas")).onchange = e => {
        state.mostrarInativas = e.target.checked; tabela();
      };
      document.getElementById(id("nova")).onclick = formNova;
      carregar();
    }

    return { title: cfg.title, sub: cfg.sub, render: view, bind };
  }

  window.VIEWS = window.VIEWS || {};

  window.VIEWS["recorrentes"] = criarTela("empresa", {
    title: "Contas fixas — empresa",
    sub: "Gastos mensais recorrentes da operação",
    rotulo: "Empresa",
    substantivo: "da empresa",
    exemplo: "ex.: ALUGUEL GALPÃO",
    rodape: "Custo fixo mensal da empresa. Cada conta gera o mesmo lançamento todo mês — os vencimentos do mês aparecem em Contas a pagar junto com as avulsas.",
    vazio: "Nenhuma conta fixa da empresa cadastrada.",
  });

  window.VIEWS["recorrentes-pessoal"] = criarTela("pessoal", {
    title: "Contas fixas — pessoal",
    sub: "Gastos mensais pessoais do sócio, pagos pela empresa",
    rotulo: "Pessoal",
    substantivo: "pessoal",
    exemplo: "ex.: CONDOMÍNIO",
    rodape: "Separadas das contas da empresa para não misturar custo operacional com retirada pessoal. Só o papel Admin enxerga esta tela — quem tem acesso Financeiro não vê estas contas.",
    vazio: "Nenhuma conta pessoal visível. Se você não é Admin, isso é esperado: o acesso Financeiro não enxerga contas pessoais.",
  });
})();
