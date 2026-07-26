/* Relatórios — gráficos sobre dados vivos (LIVE.fretes / LIVE.contasPagar / LIVE.frota) */
(function () {
  const U = window.U;
  let charts = [];

  const AZUL = "#1d4ed8", AZUL_SOFT = "rgba(29,78,216,.14)", VERDE = "#158a53",
    AMBAR = "#e59413", VERMELHO = "#c22f2f", CINZA = "#8a94a3",
    PALETA = ["#1d4ed8", "#158a53", "#e59413", "#7c3aed", "#c22f2f", "#0e7490", "#be185d", "#4d7c0f"];

  const MES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const mesChave = iso => iso.slice(0, 7); // "2026-07"
  const mesLabel = chave => { const [y, m] = chave.split("-"); return `${MES_ABREV[Number(m) - 1]}/${y.slice(2)}`; };
  const mesesOrdenados = fretes => [...new Set(fretes.map(f => mesChave(f.data)))].sort();

  /* empresa = parte depois do "CONTATO - " (ex.: "ROBSON -NJG" → NJG) */
  function empresaDe(t) {
    t = (t || "").trim();
    const m = t.match(/-\s*(.+)$/);
    return m ? m[1].trim() : t;
  }

  /* PHORTE é a própria empresa — agenciamento interno fica fora da análise de clientes */
  const EMPRESA_PROPRIA = "PHORTE";

  /* cadastro das principais empresas (razão social + CNPJ) */
  const EMPRESA_INFO = {
    "NJG": { razao: "NJG Transportes de Cargas Ltda", cnpj: "22.847.052/0001-30" },
    "CARGOSOFT": { razao: "Cargosoft Transportes Ltda", cnpj: "05.443.883/0001-28" },
    "SHUTTLE": { razao: "Shuttle Transportes, Logística e Tecnologia Ltda", cnpj: "00.026.680/0001-12" },
    "TRANSLI": { razao: "Transli — Transportadora Liberdade Ltda", cnpj: "01.650.438/0001-88" },
    "GA TRANSPORTES": { razao: "GA Logística e Transportes Ltda (Guarulhos/SP)", cnpj: "13.292.045/0003-90" },
  };

  const state = { fretes: [], contasPagar: [], veiculos: [], erro: null };

  function view() {
    return `
    <div class="section-title" style="margin-top:0">Top 5 empresas — faturamento <span class="count-pill" id="rel-count"></span></div>
    <div class="grid-2">
      <div class="chart-card"><h3>Faturamento por empresa (R$)</h3><div class="chart-box"><canvas id="ch-top5"></canvas></div></div>
      <div class="table-wrap"><table class="tbl" style="min-width:0">
        <thead><tr><th>#</th><th>Empresa</th><th class="num">Rendimento no período</th></tr></thead>
        <tbody id="rel-top5-body"><tr><td colspan="3" class="empty">Carregando…</td></tr></tbody>
        <tfoot id="rel-top5-foot"></tfoot>
      </table></div>
    </div>
    <div class="legend-note">Agrupado pela empresa do agenciador — ex.: ROBSON e DIOGO somam na NJG. A PHORTE (agenciamento interno) fica fora do ranking por ser a própria empresa; os fretes dela seguem contando na receita.</div>

    <div class="section-title">Demais análises</div>
    <div class="charts-grid">
      <div class="chart-card"><h3>Fretes por motorista (R$)</h3><div class="chart-box"><canvas id="ch-motorista"></canvas></div></div>
      <div class="chart-card"><h3>Fretes por mês (R$)</h3><div class="chart-box"><canvas id="ch-mes"></canvas></div></div>
      <div class="chart-card"><h3>Viagens por mês</h3><div class="chart-box"><canvas id="ch-viagens"></canvas></div></div>
      <div class="chart-card"><h3>Rotas mais utilizadas — top 8</h3><div class="chart-box"><canvas id="ch-rotas"></canvas></div></div>
      <div class="chart-card"><h3>Despesas em aberto por categoria</h3><div class="chart-box"><canvas id="ch-cat"></canvas></div></div>
      <div class="chart-card"><h3>Fretes: recebidos × pendentes</h3><div class="chart-box"><canvas id="ch-status"></canvas></div></div>
      <div class="chart-card"><h3>Consumo médio por veículo (km/l)</h3><div class="chart-box"><canvas id="ch-consumo"></canvas></div></div>
      <div class="chart-card"><h3>Manutenção — km até a troca de óleo</h3><div class="chart-box"><canvas id="ch-oleo"></canvas></div></div>
    </div>
    <div class="legend-note" id="rel-legend-fretes">Carregando…</div>`;
  }

  function destruir() { charts.forEach(c => c.destroy()); charts = []; }

  function mk(id, cfg) {
    const el = document.getElementById(id);
    if (!el || typeof Chart === "undefined") return;
    charts.push(new Chart(el, cfg));
  }

  const OPT = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, grid: { color: "#eef1f6" } }, x: { grid: { display: false } } },
  };

  function renderTop5() {
    const porE = {};
    state.fretes.forEach(f => {
      if (!f.transportadora) return;
      const e = empresaDe(f.transportadora);
      if (e.toUpperCase() === EMPRESA_PROPRIA) return;
      porE[e] = porE[e] || { total: 0, n: 0 };
      porE[e].total += f.valor_frete; porE[e].n++;
    });
    const top5 = Object.entries(porE).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
    const totPeriodo = U.sum(state.fretes, f => f.valor_frete);

    document.getElementById("rel-count").textContent = `${state.fretes.length} fretes · ${U.money(totPeriodo)}`;
    document.getElementById("rel-top5-body").innerHTML = top5.length ? top5.map(([e, v], i) => {
      const info = EMPRESA_INFO[e.toUpperCase()];
      return `<tr>
        <td class="td-main" style="font-size:15px">${i + 1}º</td>
        <td><div class="td-main" style="font-size:14.5px">${U.esc(e)}</div>
          ${info ? `<div class="td-sub">CNPJ ${U.esc(info.cnpj)}</div>` : ""}</td>
        <td class="num" style="font-size:15px;font-weight:700">${U.money(v.total)}</td>
      </tr>`;
    }).join("") : '<tr><td colspan="3" class="empty">Sem fretes no período.</td></tr>';
    document.getElementById("rel-top5-foot").innerHTML = top5.length ? `<tr><td colspan="2">Top 5 juntas</td>
      <td class="num">${U.money(top5.reduce((a, x) => a + x[1].total, 0))}</td></tr>` : "";
    document.getElementById("rel-legend-fretes").textContent =
      `Gráficos calculados sobre os ${state.fretes.length} fretes cadastrados no Supabase.`;
  }

  function desenharGraficos() {
    destruir();
    const meses = mesesOrdenados(state.fretes);
    const lbl = meses.map(mesLabel);

    /* top 5 empresas (sem a PHORTE, que é a própria empresa) */
    const porE = {};
    state.fretes.forEach(f => {
      if (!f.transportadora) return;
      const e = empresaDe(f.transportadora);
      if (e.toUpperCase() === EMPRESA_PROPRIA) return;
      porE[e] = (porE[e] || 0) + f.valor_frete;
    });
    const top5 = Object.entries(porE).sort((a, b) => b[1] - a[1]).slice(0, 5);
    mk("ch-top5", {
      type: "bar",
      data: { labels: top5.map(t => t[0]), datasets: [{ data: top5.map(t => t[1]), backgroundColor: [AZUL, "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"], borderRadius: 5 }] },
      options: { ...OPT, indexAxis: "y", scales: { x: { beginAtZero: true, grid: { color: "#eef1f6" } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => U.money(c.parsed.x) } } } },
    });

    /* fretes por motorista */
    const porM = {};
    state.fretes.forEach(f => { const nome = f.motoristas ? f.motoristas.nome : "—"; porM[nome] = (porM[nome] || 0) + f.valor_frete; });
    const ms = Object.entries(porM).sort((a, b) => b[1] - a[1]);
    mk("ch-motorista", {
      type: "bar",
      data: { labels: ms.map(m => m[0].split(" ")[0]), datasets: [{ data: ms.map(m => m[1]), backgroundColor: VERDE, borderRadius: 5 }] },
      options: { ...OPT, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => U.money(c.parsed.y) } } } },
    });

    /* fretes por mês */
    mk("ch-mes", {
      type: "bar",
      data: { labels: lbl, datasets: [{ data: meses.map(m => U.sum(state.fretes.filter(f => mesChave(f.data) === m), f => f.valor_frete)), backgroundColor: AZUL, borderRadius: 5 }] },
      options: { ...OPT, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => U.money(c.parsed.y) } } } },
    });

    /* viagens por mês */
    mk("ch-viagens", {
      type: "line",
      data: { labels: lbl, datasets: [{ data: meses.map(m => state.fretes.filter(f => mesChave(f.data) === m).length), borderColor: AZUL, backgroundColor: AZUL_SOFT, fill: true, tension: .3, pointRadius: 4 }] },
      options: OPT,
    });

    /* rotas */
    const porR = {};
    state.fretes.forEach(f => {
      const o = (f.origem || "").split("-").pop().trim(), d = (f.destino || "").split("-").pop().trim();
      const r = `${o} → ${d}`;
      porR[r] = (porR[r] || 0) + 1;
    });
    const topR = Object.entries(porR).sort((a, b) => b[1] - a[1]).slice(0, 8);
    mk("ch-rotas", {
      type: "bar",
      data: { labels: topR.map(r => r[0].length > 28 ? r[0].slice(0, 27) + "…" : r[0]), datasets: [{ data: topR.map(r => r[1]), backgroundColor: "#7c3aed", borderRadius: 5 }] },
      options: { ...OPT, indexAxis: "y", scales: { x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: "#eef1f6" } }, y: { grid: { display: false } } } },
    });

    /* despesas por categoria (contas a pagar em aberto) */
    const porC = {};
    state.contasPagar.filter(c => !c.pago_em).forEach(c => { porC[c.categoria] = (porC[c.categoria] || 0) + c.valor; });
    const cats = Object.entries(porC).sort((a, b) => b[1] - a[1]);
    mk("ch-cat", {
      type: "doughnut",
      data: { labels: cats.map(c => c[0]), datasets: [{ data: cats.map(c => c[1]), backgroundColor: PALETA, borderWidth: 2, borderColor: "#fff" }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "58%",
        plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: c => `${c.label}: ${U.money(c.parsed)}` } } },
      },
    });

    /* status recebimento fretes */
    const stCount = { pago: 0, programado: 0, pendente: 0 };
    state.fretes.forEach(f => stCount[U.fretePagtoStatus(f)]++);
    mk("ch-status", {
      type: "doughnut",
      data: { labels: ["Recebidos", "Programados", "Pendentes"], datasets: [{ data: [stCount.pago, stCount.programado, stCount.pendente], backgroundColor: [VERDE, AZUL, AMBAR], borderWidth: 2, borderColor: "#fff" }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "58%",
        plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } } },
      },
    });

    /* consumo por veículo + linha da média (só cavalos têm média de consumo) */
    const vs = state.veiculos.filter(v => v.media_kml);
    const mf = U.mediaFrota(state.veiculos);
    mk("ch-consumo", {
      type: "bar",
      data: {
        labels: vs.map(v => U.placaFmt(v.placa)),
        datasets: [
          { type: "bar", data: vs.map(v => v.media_kml), backgroundColor: vs.map(v => v.media_kml < mf * 0.95 ? AMBAR : AZUL), borderRadius: 5, order: 2 },
          { type: "line", data: vs.map(() => mf), borderColor: VERMELHO, borderDash: [6, 4], pointRadius: 0, borderWidth: 2, order: 1, label: "média da frota" },
        ],
      },
      options: { ...OPT, scales: { y: { beginAtZero: false, suggestedMin: 2.3, grid: { color: "#eef1f6" } }, x: { grid: { display: false } } } },
    });

    /* óleo — km restantes */
    const vo = state.veiculos.filter(v => v.km_atual && v.km_troca);
    mk("ch-oleo", {
      type: "bar",
      data: {
        labels: vo.map(v => U.placaFmt(v.placa)),
        datasets: [{ data: vo.map(v => v.km_troca - v.km_atual), backgroundColor: vo.map(v => { const r = v.km_troca - v.km_atual; return r <= 0 ? VERMELHO : r < 10000 ? AMBAR : VERDE; }), borderRadius: 5 }],
      },
      options: {
        ...OPT,
        scales: { y: { grid: { color: "#eef1f6" }, title: { display: true, text: "km restantes", font: { size: 11 } } }, x: { grid: { display: false } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${U.num(c.parsed.y)} km ${c.parsed.y <= 0 ? "(vencida)" : "restantes"}` } } },
      },
    });
  }

  async function carregar() {
    try {
      const [fretes, contasPagar, frota] = await Promise.all([
        window.LIVE.fretes(), window.LIVE.contasPagar(), window.LIVE.frota(),
      ]);
      state.fretes = fretes;
      state.contasPagar = contasPagar;
      state.veiculos = frota.filter(v => v.tipo === "cavalo");
      state.erro = null;
    } catch (e) {
      state.fretes = []; state.contasPagar = []; state.veiculos = [];
      state.erro = "Não foi possível carregar os relatórios: " + (e.message || e);
      document.getElementById("rel-top5-body").innerHTML = `<tr><td colspan="3" class="empty">${U.esc(state.erro)}</td></tr>`;
      document.getElementById("rel-legend-fretes").textContent = "";
      return;
    }
    renderTop5();
    if (typeof Chart === "undefined") {
      document.querySelectorAll(".chart-box").forEach(b => b.innerHTML =
        '<div class="empty">Gráficos indisponíveis sem conexão (CDN do Chart.js).</div>');
      return;
    }
    desenharGraficos();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.relatorios = {
    title: "Relatório de operação",
    sub: "Análises visuais de fretes, rotas e frota",
    render: view, bind: carregar, teardown: destruir,
  };
})();
