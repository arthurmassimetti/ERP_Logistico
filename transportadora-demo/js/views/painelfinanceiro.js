/* Dashboard financeiro — visão consolidada: KPIs do mês, gráficos e o que está pendente.
   Junta dado de contas_pagar, contas_fixas, vw_contas_receber, saldos_banco e fretes. */
(function () {
  const U = window.U;
  let chFluxo = null, chCategorias = null, chTransp = null;

  const state = {
    avulsas: [], fixas: [], receber: [], vencs: [], recebidosMes: [], saldos: [], fretes: [],
    mesesFluxo: 6, erro: null,
  };

  const CORES = ["#1d4ed8", "#158a53", "#b45309", "#c22f2f", "#7c3aed", "#0891b2", "#be185d", "#65a30d"];
  const NOME_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  function view() {
    return `
    <div class="kpi-grid" id="pf-kpis"><div class="empty">Carregando…</div></div>

    <div class="grid-2 mt">
      <div class="chart-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:10px; flex-wrap:wrap">
          <h3 style="margin:0">Fluxo de caixa realizado</h3>
          <select id="pf-periodo" style="width:auto">
            <option value="3">últimos 3 meses</option>
            <option value="6" selected>últimos 6 meses</option>
            <option value="12">últimos 12 meses</option>
          </select>
        </div>
        <div class="chart-box"><canvas id="ch-fluxo"></canvas></div>
        <div class="legend-note">"Pago" conta só as avulsas com baixa registrada — contas fixas ainda não têm histórico de baixa mês a mês no banco.</div>
      </div>
      <div class="chart-card">
        <h3>Despesas por categoria</h3>
        <div class="chart-box"><canvas id="ch-categorias"></canvas></div>
      </div>
    </div>

    <div class="grid-2 mt">
      <div class="chart-card">
        <h3>A receber por transportadora</h3>
        <div class="chart-box"><canvas id="ch-transp"></canvas></div>
      </div>
      <div class="card card-pad">
        <div class="section-title" style="margin-top:0">Últimas movimentações</div>
        <div id="pf-mov"><div class="empty">Carregando…</div></div>
      </div>
    </div>

    <div class="grid-2 mt">
      <div class="card card-pad">
        <div class="section-title" style="margin-top:0">Próximas a vencer / atrasadas <span class="count-pill" id="pf-venc-count"></span></div>
        <div id="pf-venc"><div class="empty">Carregando…</div></div>
        <div class="mt"><a class="btn btn-sm" href="#/financeiro">ver contas a pagar →</a></div>
      </div>
      <div class="card card-pad">
        <div class="section-title" style="margin-top:0">Próximas a receber <span class="count-pill" id="pf-receber-count"></span></div>
        <div id="pf-receber"><div class="empty">Carregando…</div></div>
        <div class="mt"><a class="btn btn-sm" href="#/receber">ver contas a receber →</a></div>
      </div>
    </div>`;
  }

  function kpis() {
    const mes = U.mesAtualISO();
    const totFixasMes = U.sum(state.fixas.filter(f => f.ativa), f => f.valor);
    const avulsasMesAberto = state.avulsas.filter(c => !c.pago_em && c.vencimento.slice(0, 7) === mes);
    const totPagarMes = U.sum(avulsasMesAberto, c => c.valor) + totFixasMes;

    const receberMes = state.receber.filter(r => r.pagamento_previsto && r.pagamento_previsto.slice(0, 7) === mes);
    const totReceberMes = U.sum(receberMes, r => r.valor_pendente);

    const pagoMes = state.avulsas.filter(c => c.pago_em && c.pago_em.slice(0, 7) === mes);
    const totPagoMes = U.sum(pagoMes, c => c.valor);

    const totRecebidoMes = U.sum(state.recebidosMes, r => (r.saldo != null ? r.saldo : (r.valor_frete || 0) - (r.adiantamento || 0)));

    const pagarAtraso = U.contasVencidas(state.avulsas);
    const receberAtraso = state.receber.filter(r => r.pagamento_previsto && U.diasAte(r.pagamento_previsto) < 0);
    const totAtrasoContas = pagarAtraso.length + receberAtraso.length;

    /* mesma função que financeiro.js usa pro card "Previsão 30 dias" — garante que as duas
       telas nunca mais mostrem números diferentes pra essa conta */
    const prev = U.calcPrevisao(state.saldos, state.receber, state.avulsas, state.vencs, 30);
    const saldoTotal = prev.saldoTotal, totPagar30 = prev.totPagar, entra30 = prev.entra, saldoPrevisto = prev.previsto;

    document.getElementById("pf-kpis").innerHTML = `
      <div class="kpi"><div class="kpi-label">${U.icons.cash} A pagar no mês</div>
        <div class="kpi-value neg">${U.money(totPagarMes)}</div>
        <div class="kpi-sub">fixas + avulsas do mês</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.receive} A receber no mês</div>
        <div class="kpi-value pos">${U.money(totReceberMes)}</div>
        <div class="kpi-sub">${receberMes.length} frete(s) previstos</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.wallet} Pago no mês</div>
        <div class="kpi-value">${U.money(totPagoMes)}</div>
        <div class="kpi-sub">${pagoMes.length} conta(s) avulsa(s)</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.wallet} Recebido no mês</div>
        <div class="kpi-value pos">${U.money(totRecebidoMes)}</div>
        <div class="kpi-sub">${state.recebidosMes.length} frete(s)</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.alert} Contas em atraso</div>
        <div class="kpi-value ${totAtrasoContas ? "neg" : ""}">${totAtrasoContas}</div>
        <div class="kpi-sub">${pagarAtraso.length} a pagar · ${receberAtraso.length} a receber</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.chart} Saldo previsto (30d)</div>
        <div class="kpi-value ${saldoPrevisto >= 0 ? "" : "neg"}">${U.money(saldoPrevisto)}</div>
        <div class="kpi-sub">entra ${U.money(entra30)} · sai ${U.money(totPagar30)}</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.gauge} Saldo realizado</div>
        <div class="kpi-value">${U.money(saldoTotal)}</div>
        <div class="kpi-sub">saldo bancário atual</div></div>`;
  }

  function mesesRecentes(n) {
    const out = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < n; i++) {
      out.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      d.setMonth(d.getMonth() - 1);
    }
    return out;
  }
  function labelMes(m) {
    const [y, mm] = m.split("-");
    return NOME_MES[Number(mm) - 1] + "/" + y.slice(2);
  }

  function drawFluxo() {
    const el = document.getElementById("ch-fluxo");
    if (!el || typeof Chart === "undefined") return;
    if (chFluxo) { chFluxo.destroy(); chFluxo = null; }
    const meses = mesesRecentes(state.mesesFluxo);
    const saidas = meses.map(m => U.sum(state.avulsas.filter(c => c.pago_em && c.pago_em.slice(0, 7) === m), c => c.valor));
    const entradas = meses.map(m => U.sum(
      state.fretes.filter(f => f.pagamento_realizado && f.pagamento_realizado.slice(0, 7) === m),
      f => (f.saldo != null ? f.saldo : (f.valor_frete || 0) - (f.adiantamento || 0))
    ));
    chFluxo = new Chart(el, {
      type: "bar",
      data: {
        labels: meses.map(labelMes),
        datasets: [
          { label: "Recebido", data: entradas, backgroundColor: "#158a53", borderRadius: 5 },
          { label: "Pago (avulsas)", data: saidas, backgroundColor: "#c22f2f", borderRadius: 5 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${U.money(c.parsed.y)}` } } },
        scales: { y: { grid: { color: "#eef1f6" } }, x: { grid: { display: false } } },
      },
    });
  }

  function drawCategorias() {
    const el = document.getElementById("ch-categorias");
    if (!el || typeof Chart === "undefined") return;
    if (chCategorias) { chCategorias.destroy(); chCategorias = null; }
    const porCat = {};
    state.avulsas.forEach(c => { const k = c.categoria || "Sem categoria"; porCat[k] = (porCat[k] || 0) + c.valor; });
    const entradas = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
    if (!entradas.length) { el.parentElement.querySelector(".empty")?.remove(); el.style.display = "none"; return; }
    chCategorias = new Chart(el, {
      type: "doughnut",
      data: { labels: entradas.map(e => e[0]), datasets: [{ data: entradas.map(e => e[1]), backgroundColor: CORES, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 11, font: { size: 10.5 } } },
          tooltip: { callbacks: { label: c => `${c.label}: ${U.money(c.parsed)}` } } },
      },
    });
  }

  function drawTransp() {
    const el = document.getElementById("ch-transp");
    if (!el || typeof Chart === "undefined") return;
    if (chTransp) { chTransp.destroy(); chTransp = null; }
    const porEmp = {};
    state.receber.forEach(r => { const k = r.empresa || "Sem transportadora"; porEmp[k] = (porEmp[k] || 0) + r.valor_pendente; });
    const entradas = Object.entries(porEmp).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!entradas.length) return;
    chTransp = new Chart(el, {
      type: "bar",
      data: { labels: entradas.map(e => e[0]), datasets: [{ label: "Pendente", data: entradas.map(e => e[1]), backgroundColor: "#1d4ed8", borderRadius: 5 }] },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => U.money(c.parsed.x) } } },
        scales: { x: { grid: { color: "#eef1f6" } }, y: { grid: { display: false } } },
      },
    });
  }

  function movimentacoes() {
    const pagos = state.avulsas.filter(c => c.pago_em).map(c => ({ data: c.pago_em, desc: c.descricao, valor: -c.valor, tipo: "pago" }));
    const recebidos = state.fretes.filter(f => f.pagamento_realizado).map(f => ({
      data: f.pagamento_realizado, desc: `Frete ${f.transportadora || "—"}`,
      valor: (f.saldo != null ? f.saldo : (f.valor_frete || 0) - (f.adiantamento || 0)), tipo: "recebido",
    }));
    const todas = [...pagos, ...recebidos].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 8);
    document.getElementById("pf-mov").innerHTML = todas.length ? todas.map(m => `
      <div class="fleet-row" style="border-bottom:1px solid var(--border)">
        <span class="lbl">${U.dBR(m.data)} · ${U.esc(m.desc)} ${m.tipo === "pago" ? '<span class="tag tag-danger">pago</span>' : '<span class="tag tag-ok">recebido</span>'}</span>
        <span class="val">${m.valor < 0 ? "− " : "+ "}${U.money(Math.abs(m.valor))}</span>
      </div>`).join("") : '<div class="empty">Nenhuma movimentação registrada ainda.</div>';
  }

  function listaVencimentos() {
    /* gerar_vencimentos() nunca traz data < hoje — soma as avulsas atrasadas direto de state.avulsas,
       senão uma conta vencida nunca apareceria nesta lista de "atrasadas" */
    const atrasadasAvulsas = U.contasVencidas(state.avulsas)
      .map(c => ({ data: c.vencimento, descricao: c.descricao, valor: c.valor, fixa: false }));
    const abertos = [...atrasadasAvulsas, ...state.vencs].sort((a, b) => a.data.localeCompare(b.data));
    document.getElementById("pf-venc-count").textContent = `${abertos.length}`;
    document.getElementById("pf-venc").innerHTML = abertos.slice(0, 6).map(v => {
      const d = U.diasAte(v.data);
      const tag = d < 0 ? '<span class="tag tag-danger">vencida</span>'
        : d === 0 ? '<span class="tag tag-danger">hoje</span>'
        : d <= 7 ? `<span class="tag tag-warn">${U.dBR(v.data)}</span>`
        : `<span class="tag tag-neutro">${U.dBR(v.data)}</span>`;
      return `<div class="fleet-row" style="border-bottom:1px solid var(--border)">
        <span class="lbl">${U.esc(v.descricao)} ${tag}</span><span class="val">${U.money(v.valor)}</span></div>`;
    }).join("") || '<div class="empty">Nada em aberto nos próximos 45 dias.</div>';
  }

  function listaReceber() {
    const abertos = [...state.receber].sort((a, b) => (a.pagamento_previsto || "9999").localeCompare(b.pagamento_previsto || "9999"));
    document.getElementById("pf-receber-count").textContent = `${abertos.length}`;
    document.getElementById("pf-receber").innerHTML = abertos.slice(0, 6).map(r => {
      const d = r.pagamento_previsto ? U.diasAte(r.pagamento_previsto) : null;
      const tag = d === null ? '<span class="tag tag-neutro">sem previsão</span>'
        : d < 0 ? '<span class="tag tag-danger">atrasado</span>'
        : `<span class="tag tag-neutro">${U.dBR(r.pagamento_previsto)}</span>`;
      return `<div class="fleet-row" style="border-bottom:1px solid var(--border)">
        <span class="lbl">${U.esc(r.empresa || "—")} ${tag}</span><span class="val">${U.money(r.valor_pendente)}</span></div>`;
    }).join("") || '<div class="empty">Nenhum recebível pendente.</div>';
  }

  async function carregar() {
    try {
      const [avulsas, fixas, receber, vencs, recebidosMes, saldos, fretes] = await Promise.all([
        LIVE.contasPagar(), LIVE.contasFixas(), LIVE.contasReceber(), LIVE.vencimentos(45),
        LIVE.recebidosNoMes(U.mesAtualISO()), LIVE.saldosBanco(), LIVE.fretes(),
      ]);
      state.avulsas = avulsas; state.fixas = fixas; state.receber = receber; state.vencs = vencs;
      state.recebidosMes = recebidosMes; state.saldos = saldos; state.fretes = fretes;
      state.erro = null;
    } catch (e) {
      state.erro = "Não foi possível carregar o painel financeiro: " + (e.message || e);
    }
    if (state.erro) {
      document.getElementById("pf-kpis").innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`;
      return;
    }
    kpis(); drawFluxo(); drawCategorias(); drawTransp();
    movimentacoes(); listaVencimentos(); listaReceber();
  }

  function bind() {
    document.getElementById("pf-periodo").onchange = e => { state.mesesFluxo = Number(e.target.value); drawFluxo(); };
    carregar();
  }

  function teardown() {
    if (chFluxo) { chFluxo.destroy(); chFluxo = null; }
    if (chCategorias) { chCategorias.destroy(); chCategorias = null; }
    if (chTransp) { chTransp.destroy(); chTransp = null; }
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.painelfinanceiro = {
    title: "Dashboard financeiro",
    sub: "Visão consolidada — KPIs do mês, gráficos e o que está pendente",
    render: view, bind, teardown,
  };
})();
