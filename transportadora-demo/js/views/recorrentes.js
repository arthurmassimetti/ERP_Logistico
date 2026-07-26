/* Contas fixas mensais (aluguel, financiamento, mensalidades...). Cada uma gera o
   mesmo lançamento todo mês, no dia configurado — cadastro único, sem redigitar.

   UMA tela com DOIS painéis lado a lado: empresa e pessoal. A separação é só de
   visualização; no banco continua sendo uma tabela só (contas_fixas, coluna
   origem). Ver os dois juntos é o ponto: o custo da operação e a retirada
   pessoal do sócio são coisas diferentes e vale enxergar a proporção.

   Quem tem papel 'financeiro' não recebe as pessoais por regra de RLS — o
   painel avisa em vez de parecer quebrado. */
(function () {
  const U = window.U;

  const state = { fixas: [], erro: null, mostrarInativas: { empresa: false, pessoal: false } };

  const CFG = {
    empresa: {
      rotulo: "Empresa",
      substantivo: "da empresa",
      exemplo: "ex.: ALUGUEL GALPÃO",
      vazio: "Nenhuma conta fixa da empresa cadastrada.",
      cor: "var(--text-2)",
    },
    pessoal: {
      rotulo: "Pessoal",
      substantivo: "pessoal",
      exemplo: "ex.: CONDOMÍNIO",
      vazio: "Nenhuma conta pessoal visível. Se você não é Admin, isso é esperado: o acesso Financeiro não enxerga contas pessoais.",
      cor: "var(--info)",
    },
  };

  const doOrigem = (o) => state.fixas.filter(f => f.origem === o);
  const ativasDe = (o) => doOrigem(o).filter(f => f.ativa);

  /* ------------------------------------------------------------------ topo */
  function kpis() {
    const emp = U.sum(ativasDe("empresa"), f => f.valor);
    const pes = U.sum(ativasDe("pessoal"), f => f.valor);
    const total = emp + pes;
    const pct = total ? Math.round((pes / total) * 100) : 0;
    document.getElementById("rx-kpis").innerHTML = `
      <div class="kpi"><div class="kpi-label">${U.icons.cash} Empresa</div>
        <div class="kpi-value">${U.money(emp)}</div>
        <div class="kpi-sub">${ativasDe("empresa").length} conta(s) · por mês</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.users} Pessoal</div>
        <div class="kpi-value">${U.money(pes)}</div>
        <div class="kpi-sub">${ativasDe("pessoal").length} conta(s) · por mês</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.wallet} Total por mês</div>
        <div class="kpi-value neg">${U.money(total)}</div>
        <div class="kpi-sub">${pct}% é pessoal</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.calendar} No ano</div>
        <div class="kpi-value">${U.money(total * 12)}</div>
        <div class="kpi-sub">projeção de 12 meses</div></div>`;
  }

  /* --------------------------------------------------------------- painéis */
  function painel(origem) {
    const cfg = CFG[origem];
    return `
    <div class="card card-pad" id="rx-painel-${origem}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">
        <div class="section-title" style="margin:0;color:${cfg.cor}">${cfg.rotulo}</div>
        <div class="kpi-value" style="font-size:19px" id="rx-total-${origem}"></div>
      </div>
      <div id="rx-lista-${origem}" class="mt"><div class="empty">Carregando…</div></div>
      <div class="mt" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;
                             border-top:1px solid var(--border);padding-top:12px">
        <button class="btn btn-sm btn-primary" id="rx-nova-${origem}" disabled>+ Nova conta ${cfg.substantivo}</button>
        <label class="check-inline" style="padding:0">
          <input type="checkbox" id="rx-inativas-${origem}"> mostrar inativas</label>
      </div>
    </div>`;
  }

  function lista(origem) {
    const cfg = CFG[origem];
    const fs = doOrigem(origem)
      .filter(f => state.mostrarInativas[origem] || f.ativa)
      .sort((a, b) => a.dia_venc - b.dia_venc);

    document.getElementById("rx-total-" + origem).textContent =
      U.money(U.sum(ativasDe(origem), f => f.valor));

    const alvo = document.getElementById("rx-lista-" + origem);
    if (!fs.length) {
      alvo.innerHTML = `<div class="empty">${doOrigem(origem).length
        ? "Nenhuma conta ativa. Marque “mostrar inativas”."
        : U.esc(cfg.vazio)}</div>`;
      return;
    }

    /* min-width 0: a tabela padrão tem 640px de largura mínima, o que forçaria
       rolagem lateral dentro de cada painel na visão lado a lado */
    alvo.innerHTML = `
      <div class="table-wrap" style="box-shadow:none">
        <table class="tbl" style="min-width:0">
          <thead><tr><th>Conta</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody>${fs.map(f => `
            <tr style="${!f.ativa ? "opacity:.55" : ""}">
              <td>
                <div class="td-main">${U.esc(f.descricao)}</div>
                <div class="td-sub">dia ${f.dia_venc}${f.forma_pagto ? " · " + U.esc(f.forma_pagto) : ""}${f.data_fim ? " · até " + U.dBR(f.data_fim) : ""}</div>
                ${!f.ativa ? '<span class="tag tag-neutro">inativa</span>' : ""}
                ${f.pendente ? '<span class="tag tag-warn">confirmar manual</span>' : ""}
              </td>
              <td class="num">${U.money(f.valor)}</td>
              <td><button class="btn btn-sm btn-ghost" data-toggle="${f.id}">${f.ativa ? "desativar" : "reativar"}</button></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;

    alvo.querySelectorAll("[data-toggle]").forEach(b => b.onclick = async () => {
      const f = state.fixas.find(x => x.id === b.dataset.toggle);
      b.disabled = true;
      try {
        Object.assign(f, await LIVE.atualizarContaFixa(f.id, { ativa: !f.ativa }));
        kpis(); lista(origem);
        U.toast(f.ativa ? "Conta reativada." : "Conta desativada.");
      } catch (e) {
        U.toast("Erro: " + (e.message || e));
        b.disabled = false;
      }
    });
  }

  /* --------------------------------------------------------------- cadastro */
  function formNova(origem) {
    const cfg = CFG[origem];
    U.openDrawer({
      titulo: `Nova conta fixa — ${cfg.rotulo.toLowerCase()}`,
      sub: "Gera o mesmo lançamento todo mês, no dia informado.",
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Descrição<span class="req">*</span></label><input id="nx-desc" placeholder="${cfg.exemplo}"></div>
        <div><label>Valor (R$)<span class="req">*</span></label><input type="number" step="0.01" min="0" id="nx-valor"></div>
        <div><label>Dia do vencimento<span class="req">*</span></label><input type="number" min="1" max="31" id="nx-dia" value="10"></div>
        <div class="full"><label>Forma</label><input id="nx-forma" placeholder="ex.: BOLETO, PIX, DEB AUTO"></div>
        <div class="full"><label>Termina em (opcional, p/ parcelado)</label><input type="date" id="nx-fim"></div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório ·
          será criada como conta <b>${cfg.rotulo.toLowerCase()}</b></div>
      </div>`,
      rodape: `
        <button class="btn" id="nx-cancel">Cancelar</button>
        <button class="btn btn-primary" id="nx-save">Criar conta</button>`,
    });
    document.getElementById("nx-cancel").onclick = U.closeDrawer;
    document.getElementById("nx-save").onclick = async () => {
      const desc = document.getElementById("nx-desc").value.trim();
      const valor = parseFloat(document.getElementById("nx-valor").value) || 0;
      const dia = parseInt(document.getElementById("nx-dia").value, 10);
      if (!desc || valor <= 0 || !dia || dia < 1 || dia > 31) {
        U.toast("Preencha descrição, valor e um dia válido (1-31)."); return;
      }
      const fim = document.getElementById("nx-fim").value;
      const btn = document.getElementById("nx-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const criado = await LIVE.criarContaFixa({
          descricao: desc.toUpperCase(), valor, dia_venc: dia,
          origem,                                  // fixado pelo painel, não escolhido
          forma_pagto: document.getElementById("nx-forma").value.trim().toUpperCase() || null,
          recorrencia: fim ? "PARCELADO" : "MENSAL",
          data_fim: fim || null,
          ativa: true,
        });
        state.fixas.push(criado);
        kpis(); lista(origem);
        U.closeDrawer();
        U.toast("Conta fixa criada.");
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Criar conta";
      }
    };
  }

  /* ------------------------------------------------------------------ tela */
  function view() {
    return `
    <div class="kpi-grid" id="rx-kpis"><div class="empty">Carregando…</div></div>

    <div class="grid-2 mt">
      ${painel("empresa")}
      ${painel("pessoal")}
    </div>

    <div class="legend-note">
      Cada conta gera o mesmo lançamento todo mês, no dia configurado — os vencimentos
      aparecem em Contas a pagar junto com as avulsas. As pessoais ficam separadas para
      não misturar custo da operação com retirada do sócio.
    </div>`;
  }

  async function carregar() {
    try {
      state.fixas = await LIVE.contasFixas();
      state.erro = null;
    } catch (e) {
      state.erro = "Não foi possível carregar as contas fixas: " + (e.message || e);
    }
    ["empresa", "pessoal"].forEach(o => {
      document.getElementById("rx-nova-" + o).disabled = false;
    });
    if (state.erro) {
      document.getElementById("rx-kpis").innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`;
      ["empresa", "pessoal"].forEach(o => {
        document.getElementById("rx-lista-" + o).innerHTML = "";
      });
      return;
    }
    kpis();
    lista("empresa");
    lista("pessoal");
  }

  function bind() {
    ["empresa", "pessoal"].forEach(o => {
      document.getElementById("rx-nova-" + o).onclick = () => formNova(o);
      document.getElementById("rx-inativas-" + o).onchange = e => {
        state.mostrarInativas[o] = e.target.checked; lista(o);
      };
    });
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.recorrentes = {
    title: "Contas fixas mensais",
    sub: "Empresa e pessoal, lado a lado",
    render: view, bind,
  };
})();
