/* Financeiro — contas avulsas a pagar. Dados vivos do Supabase.
   Contas fixas (recorrentes) têm tela própria (js/views/recorrentes.js).
   Contas a receber também tem tela própria (js/views/receber.js), gerada automaticamente pelos fretes. */
(function () {
  const U = window.U;

  const state = {
    saldos: [], fixas: [], avulsas: [], receber: [], vencs: [],
    catFiltro: "", formaFiltro: "", mostrarPagas: false,
    erro: null,
  };

  function view() {
    return `
    <div class="kpi-grid" id="fin-kpis"><div class="empty">Carregando…</div></div>

    <div class="section-title">Contas avulsas a pagar <span class="count-pill" id="cp-count"></span></div>
    <div class="filters">
      <div class="field"><label>Categoria</label><select id="fc-cat"><option value="">todas</option></select></div>
      <div class="field"><label>Forma</label><select id="fc-forma"><option value="">todas</option></select></div>
      <div class="field"><label>&nbsp;</label><label class="check-inline"><input type="checkbox" id="fc-pagas"> mostrar já pagas</label></div>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="btn-nova-avulsa" disabled>+ Nova conta</button>
    </div>
    <div id="cp-tbl"><div class="empty">Carregando contas do banco…</div></div>
    <div class="legend-note">O registro de pagamento aqui é gravado no banco (não simulado) — some da lista e não volta ao atualizar a página.</div>

    <div class="grid-2 mt">
      <div class="card card-pad">
        <div class="section-title" style="margin-top:0">Contas fixas mensais</div>
        <div id="fin-fixas-resumo"><div class="empty">Carregando…</div></div>
        <div class="mt"><a class="btn btn-sm btn-primary" href="#/recorrentes">ver contas fixas →</a></div>
      </div>
      <div class="card card-pad">
        <div class="section-title" style="margin-top:0">Contas a receber</div>
        <div id="fin-receber-resumo"><div class="empty">Carregando…</div></div>
        <div class="mt"><a class="btn btn-sm btn-primary" href="#/receber">ver contas a receber →</a></div>
      </div>
    </div>`;
  }

  function kpis() {
    const prev = U.calcPrevisao(state.saldos, state.receber, state.avulsas, state.vencs, 30);
    const vencidas = U.contasVencidas(state.avulsas);
    const totReceber = U.sum(state.receber, r => r.valor_pendente);
    const receberAtraso = state.receber.filter(r => r.pagamento_previsto && U.diasAte(r.pagamento_previsto) < 0);

    document.getElementById("fin-kpis").innerHTML = `
      <div class="kpi"><div class="kpi-label">${U.icons.wallet} Saldo bancário</div>
        <div class="kpi-value">${U.money(prev.saldoTotal)}</div>
        <div class="kpi-sub">${state.saldos.map(s => `${U.esc(s.banco)} ${U.money(s.saldo)}`).join(" · ") || "sem contas cadastradas"}
          ${state.saldos.length ? ` · <button type="button" class="kpi-action" id="fin-btn-saldos">atualizar</button>` : ""}</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.cash} A pagar (30 dias)</div>
        <div class="kpi-value neg">${U.money(prev.totPagar)}</div>
        <div class="kpi-sub">${vencidas.length} vencida(s) de ${state.avulsas.filter(c => !c.pago_em).length} em aberto · fixas + avulsas</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.receive} A receber</div>
        <div class="kpi-value pos">${U.money(totReceber)}</div>
        <div class="kpi-sub">${receberAtraso.length} em atraso</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.chart} Previsão 30 dias</div>
        <div class="kpi-value ${prev.previsto >= 0 ? "" : "neg"}">${U.money(prev.previsto)}</div>
        <div class="kpi-sub">entra ${U.money(prev.entra)} · sai ${U.money(prev.totPagar)}</div></div>`;

    const btnSaldos = document.getElementById("fin-btn-saldos");
    if (btnSaldos) btnSaldos.onclick = abrirEditarSaldos;
  }

  function fixasResumo() {
    const ativas = state.fixas.filter(f => f.ativa);
    const emp = ativas.filter(f => f.origem === "empresa");
    const pes = ativas.filter(f => f.origem === "pessoal");
    /* separado por origem: custo da operação e retirada pessoal do sócio não
       são a mesma coisa, e o total somado esconde essa diferença */
    document.getElementById("fin-fixas-resumo").innerHTML = `
      <div class="fleet-row"><span class="lbl">Empresa <span class="muted">(${emp.length})</span></span>
        <span class="val">${U.money(U.sum(emp, f => f.valor))}</span></div>
      <div class="fleet-row"><span class="lbl">Pessoal <span class="muted">(${pes.length})</span></span>
        <span class="val">${U.money(U.sum(pes, f => f.valor))}</span></div>
      <div class="calc-line mt"><span>Total por mês</span><b>${U.money(U.sum(ativas, f => f.valor))}</b></div>`;
  }

  function abrirEditarSaldos() {
    if (!state.saldos.length) { U.toast("Nenhuma conta bancária cadastrada ainda."); return; }
    U.openDrawer({
      titulo: "Atualizar saldos",
      sub: "Informe o saldo atual de cada conta — é um número simples, não um extrato.",
      corpo: `
      <div class="form-grid">
        ${state.saldos.map(s => `<div><label>${U.esc(s.banco)}</label><input type="number" step="0.01" id="sd-${s.id}" value="${s.saldo}"></div>`).join("")}
      </div>`,
      rodape: `
        <button class="btn" id="sd-cancel">Cancelar</button>
        <button class="btn btn-primary" id="sd-save">Salvar</button>`,
    });
    document.getElementById("sd-cancel").onclick = U.closeDrawer;
    document.getElementById("sd-save").onclick = async () => {
      const btn = document.getElementById("sd-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        await Promise.all(state.saldos.map(s => {
          const v = parseFloat(document.getElementById("sd-" + s.id).value) || 0;
          return LIVE.atualizarSaldoBanco(s.id, v).then(upd => Object.assign(s, upd));
        }));
        kpis();
        U.closeDrawer();
        U.toast("Saldos atualizados.");
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Salvar";
      }
    };
  }

  function avulsasFiltradas() {
    return state.avulsas.filter(c => {
      if (!state.mostrarPagas && c.pago_em) return false;
      if (state.catFiltro && c.categoria !== state.catFiltro) return false;
      if (state.formaFiltro && c.forma !== state.formaFiltro) return false;
      return true;
    });
  }

  function preencherFiltrosAvulsas() {
    const cats = [...new Set(state.avulsas.map(c => c.categoria).filter(Boolean))].sort();
    const formas = [...new Set(state.avulsas.map(c => c.forma).filter(Boolean))].sort();
    const selCat = document.getElementById("fc-cat"); const atualCat = selCat.value;
    selCat.innerHTML = '<option value="">todas</option>' + cats.map(c => `<option>${U.esc(c)}</option>`).join("");
    selCat.value = atualCat;
    const selForma = document.getElementById("fc-forma"); const atualForma = selForma.value;
    selForma.innerHTML = '<option value="">todas</option>' + formas.map(f => `<option>${U.esc(f)}</option>`).join("");
    selForma.value = atualForma;
  }

  function tabelaAvulsas() {
    const cs = avulsasFiltradas().sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    document.getElementById("cp-count").textContent = `${cs.length} contas · ${U.money(U.sum(cs, c => c.valor))}`;
    if (!cs.length) {
      document.getElementById("cp-tbl").innerHTML = '<div class="empty">Nenhuma conta para os filtros.</div>';
      return;
    }
    document.getElementById("cp-tbl").innerHTML = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Conta</th><th>Categoria</th><th>Situação</th><th>Forma</th><th class="num">Valor</th><th></th></tr></thead>
        <tbody>${cs.map(c => `<tr>
            <td class="td-main">${U.esc(c.descricao)}</td>
            <td>${U.esc(c.categoria || "—")}</td>
            <td>${U.tagStatusVenc(c.vencimento, c.pago_em)}</td>
            <td>${U.esc(c.forma || "—")}</td>
            <td class="num">${U.money(c.valor)}</td>
            <td>${c.pago_em
              ? `<button class="btn btn-sm btn-ghost" data-desfazer="${c.id}">desfazer</button>`
              : `<button class="btn btn-sm" data-pagar="${c.id}">Registrar pagamento</button>`}</td>
          </tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="4">Total ${state.mostrarPagas ? "" : "em aberto"}</td><td class="num">${U.money(U.sum(cs, c => c.valor))}</td><td></td></tr></tfoot>
      </table></div>`;
    document.querySelectorAll("[data-pagar]").forEach(b => b.onclick = () => darBaixaAvulsa(b.dataset.pagar, true));
    document.querySelectorAll("[data-desfazer]").forEach(b => b.onclick = () => darBaixaAvulsa(b.dataset.desfazer, false));
  }

  async function darBaixaAvulsa(id, pagar) {
    const c = state.avulsas.find(x => x.id === id);
    if (!c) return;
    try {
      const upd = await LIVE.atualizarContaPagar(id, { pago_em: pagar ? U.hojeISO() : null });
      Object.assign(c, upd);
      tabelaAvulsas(); kpis();
      U.toast(pagar ? `Pagamento registrado: ${c.descricao} (${U.money(c.valor)}).` : "Pagamento desfeito.");
    } catch (e) {
      U.toast("Erro: " + (e.message || e));
    }
  }

  function formNovaAvulsa() {
    U.openDrawer({
      titulo: "Nova conta a pagar",
      sub: "Lançamento gravado direto no banco.",
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Descrição<span class="req">*</span></label><input id="na-desc" placeholder="ex.: TRUCK EIXO"></div>
        <div><label>Valor (R$)<span class="req">*</span></label><input type="number" step="0.01" min="0" id="na-valor"></div>
        <div><label>Vencimento<span class="req">*</span></label><input type="date" id="na-venc" value="${U.hojeISO()}"></div>
        <div><label>Categoria</label><input id="na-cat" list="cat-list" placeholder="ex.: Manutenção">
          <datalist id="cat-list">${[...new Set(state.avulsas.map(c => c.categoria).filter(Boolean))].sort().map(c => `<option value="${U.esc(c)}">`).join("")}</datalist></div>
        <div><label>Forma</label><input id="na-forma" list="forma-list" placeholder="ex.: BOLETO">
          <datalist id="forma-list">${[...new Set(state.avulsas.map(c => c.forma).filter(Boolean))].sort().map(f => `<option value="${U.esc(f)}">`).join("")}</datalist></div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório</div>
      </div>`,
      rodape: `
        <button class="btn" id="na-cancel">Cancelar</button>
        <button class="btn btn-primary" id="na-save">Lançar conta</button>`,
    });
    document.getElementById("na-cancel").onclick = U.closeDrawer;
    document.getElementById("na-save").onclick = async () => {
      const desc = document.getElementById("na-desc").value.trim();
      const valor = parseFloat(document.getElementById("na-valor").value) || 0;
      const venc = document.getElementById("na-venc").value;
      if (!desc || valor <= 0 || !venc) { U.toast("Preencha descrição, valor e vencimento."); return; }
      const payload = {
        descricao: desc.toUpperCase(), valor, vencimento: venc,
        categoria: document.getElementById("na-cat").value.trim() || null,
        forma: document.getElementById("na-forma").value.trim().toUpperCase() || null,
      };
      const btn = document.getElementById("na-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const criado = await LIVE.criarContaPagar(payload);
        state.avulsas.unshift(criado);
        preencherFiltrosAvulsas(); tabelaAvulsas(); kpis();
        U.closeDrawer();
        U.toast("Conta lançada.");
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Lançar conta";
      }
    };
  }

  function receberResumo() {
    const total = U.sum(state.receber, r => r.valor_pendente);
    const atraso = state.receber.filter(r => r.pagamento_previsto && U.diasAte(r.pagamento_previsto) < 0);
    document.getElementById("fin-receber-resumo").innerHTML = `
      <div class="fleet-row"><span class="lbl">Total pendente</span><span class="val">${U.money(total)}</span></div>
      <div class="fleet-row"><span class="lbl">Fretes aguardando pagamento</span><span class="val">${state.receber.length}</span></div>
      <div class="fleet-row"><span class="lbl">Em atraso</span><span class="val" style="${atraso.length ? "color:var(--danger)" : ""}">${atraso.length}</span></div>`;
  }

  async function carregar() {
    try {
      const [saldos, fixas, avulsas, receber, vencs] = await Promise.all([
        LIVE.saldosBanco(), LIVE.contasFixas(), LIVE.contasPagar(), LIVE.contasReceber(), LIVE.vencimentos(45),
      ]);
      state.saldos = saldos; state.fixas = fixas; state.avulsas = avulsas; state.receber = receber; state.vencs = vencs;
      state.erro = null;
    } catch (e) {
      state.erro = "Não foi possível carregar o financeiro: " + (e.message || e);
    }
    document.getElementById("btn-nova-avulsa").disabled = false;
    if (state.erro) {
      document.getElementById("fin-kpis").innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`;
      document.getElementById("cp-tbl").innerHTML = "";
      return;
    }
    kpis(); fixasResumo();
    preencherFiltrosAvulsas(); tabelaAvulsas();
    receberResumo();
  }

  function bind() {
    document.getElementById("fc-cat").onchange = e => { state.catFiltro = e.target.value; tabelaAvulsas(); };
    document.getElementById("fc-forma").onchange = e => { state.formaFiltro = e.target.value; tabelaAvulsas(); };
    document.getElementById("fc-pagas").onchange = e => { state.mostrarPagas = e.target.checked; tabelaAvulsas(); };
    document.getElementById("btn-nova-avulsa").onclick = formNovaAvulsa;
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.financeiro = {
    title: "Contas a pagar",
    sub: "Contas avulsas — dados vivos do banco",
    render: view, bind,
  };
})();
