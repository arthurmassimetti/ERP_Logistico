/* Resultado anual — o período consolidado: receita, custos e sobra acumulados.
   Dados vivos (LIVE.fretes / LIVE.contasFixas).

   Observação: contas_fixas só tem "data_fim" no schema, não tem data de início — uma conta fixa
   cadastrada hoje aparece como se sempre tivesse existido nos meses anteriores também. Antes (dado
   estático) isso era resolvido com um campo "inicio" só do JSON congelado, sem equivalente no banco. */
(function () {
  const U = window.U;
  let chart = null;

  const MES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const mesChave = iso => iso.slice(0, 7); // "2026-07"
  const mesLabel = chave => { const [y, m] = chave.split("-"); return `${MES_ABREV[Number(m) - 1]}/${y.slice(2)}`; };
  const mesesOrdenados = fretes => [...new Set(fretes.map(f => mesChave(f.data)))].sort();

  const state = { fretes: [], contasFixas: [], erro: null };

  /* conta fixa vale no mês (chave "YYYY-MM")? ativa e (sem data_fim ou mês <= mês do data_fim) */
  function fixaNoMes(f, chave) {
    if (!f.ativa) return false;
    if (f.data_fim && chave > f.data_fim.slice(0, 7)) return false;
    return true;
  }

  function calcular(fretes, contasFixas) {
    const meses = mesesOrdenados(fretes);
    const linhas = meses.map(chave => {
      const fs = fretes.filter(f => mesChave(f.data) === chave);
      const receita = U.sum(fs, f => f.valor_frete);
      const variaveis = U.sum(fs, f => f.comissao) + U.sum(fs, f => f.pedagio_valor) + U.sum(fs, f => f.diaria);
      const fixasEmp = U.sum(contasFixas.filter(c => c.origem === "empresa" && fixaNoMes(c, chave)), c => c.valor);
      const fixasPes = U.sum(contasFixas.filter(c => c.origem === "pessoal" && fixaNoMes(c, chave)), c => c.valor);
      const resultadoEmp = receita - variaveis - fixasEmp;
      return { chave, viagens: fs.length, receita, variaveis, fixasEmp, fixasPes,
               resultadoEmp, sobra: resultadoEmp - fixasPes };
    });
    const tot = (k) => U.sum(linhas, l => l[k]);
    return { linhas, total: {
      viagens: tot("viagens"), receita: tot("receita"), variaveis: tot("variaveis"),
      fixasEmp: tot("fixasEmp"), fixasPes: tot("fixasPes"),
      resultadoEmp: tot("resultadoEmp"), sobra: tot("sobra"),
    } };
  }

  function view() {
    return `<div id="res-wrap"><div class="empty">Carregando…</div></div>`;
  }

  function montarHtml(linhas, total) {
    const vcls = v => v >= 0 ? "pos-v" : "neg-v";
    const mesAtual = U.mesAtualISO();
    const meses = linhas.map(l => l.chave);
    const anoUnico = meses.length && meses.every(m => m.slice(0, 4) === meses[0].slice(0, 4));
    const periodo = meses.length ? (anoUnico ? meses[0].slice(0, 4) : `${mesLabel(meses[0])}–${mesLabel(meses[meses.length - 1])}`) : "—";
    const faixa = meses.length ? `${mesLabel(meses[0])}–${mesLabel(meses[meses.length - 1])}` : "—";

    return `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">${U.icons.truck} Receita ${periodo}</div>
        <div class="kpi-value">${U.money(total.receita)}</div>
        <div class="kpi-sub">${total.viagens} viagens</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.cash} Custos variáveis</div>
        <div class="kpi-value neg">${U.money(total.variaveis)}</div>
        <div class="kpi-sub">comissões, pedágio e diárias</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.calendar} Custos fixos no período</div>
        <div class="kpi-value neg">${U.money(total.fixasEmp + total.fixasPes)}</div>
        <div class="kpi-sub">empresa ${U.money(total.fixasEmp)} · pessoal ${U.money(total.fixasPes)}</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.chart} Resultado da empresa</div>
        <div class="kpi-value ${total.resultadoEmp >= 0 ? "pos" : "neg"}">${U.money(total.resultadoEmp)}</div>
        <div class="kpi-sub">acumulado ${faixa}</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.wallet} Sobra do período</div>
        <div class="kpi-value ${total.sobra >= 0 ? "pos" : "neg"}">${U.money(total.sobra)}</div>
        <div class="kpi-sub">após contas pessoais</div></div>
    </div>

    <div class="grid-2 mt">
      <div class="card card-pad">
        <div class="section-title" style="margin-top:0">${periodo} consolidado (${faixa})</div>
        <div class="cascade">
          <div class="cascade-row"><span>Receita de fretes no período</span><b>${U.money(total.receita)}</b></div>
          <div class="cascade-row"><span>(−) Comissões, pedágio e diárias</span><b class="neg-v">− ${U.money(total.variaveis)}</b></div>
          <div class="cascade-row"><span>(−) Contas fixas da empresa no período</span><b class="neg-v">− ${U.money(total.fixasEmp)}</b></div>
          <div class="cascade-row cascade-sub"><span>= Resultado da empresa no período</span>
            <b class="${vcls(total.resultadoEmp)}">${U.money(total.resultadoEmp)}</b></div>
          <div class="cascade-row"><span>(−) Contas fixas pessoais no período</span><b class="neg-v">− ${U.money(total.fixasPes)}</b></div>
          <div class="cascade-row cascade-total"><span>= Sobra acumulada</span>
            <b class="${vcls(total.sobra)}">${U.money(total.sobra)}</b></div>
        </div>
        <div class="legend-note">Contas fixas somadas mês a mês enquanto ativas (respeitando o fim de cada parcela, quando cadastrado). O mês corrente é parcial.</div>
      </div>
      <div class="chart-card">
        <h3>Receita × sobra por mês</h3>
        <div class="chart-box" style="height:300px"><canvas id="ch-ano"></canvas></div>
      </div>
    </div>

    <div class="section-title">Mês a mês</div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr>
        <th>Mês</th><th class="num">Viagens</th><th class="num">Receita</th>
        <th class="num">Variáveis</th><th class="num">Fixas empresa</th>
        <th class="num">Resultado empresa</th><th class="num">Fixas pessoais</th><th class="num">Sobra</th>
      </tr></thead>
      <tbody>
        ${linhas.length ? linhas.map(l => `<tr ${l.chave === mesAtual ? 'class="muted"' : ""}>
          <td class="td-main">${mesLabel(l.chave)}${l.chave === mesAtual ? ' <span class="tag tag-neutro">parcial</span>' : ""}</td>
          <td class="num">${l.viagens}</td>
          <td class="num">${U.money(l.receita)}</td>
          <td class="num">− ${U.money(l.variaveis)}</td>
          <td class="num">− ${U.money(l.fixasEmp)}</td>
          <td class="num"><b class="${vcls(l.resultadoEmp)}">${U.money(l.resultadoEmp)}</b></td>
          <td class="num">− ${U.money(l.fixasPes)}</td>
          <td class="num"><b class="${vcls(l.sobra)}">${U.money(l.sobra)}</b></td>
        </tr>`).join("") : `<tr><td colspan="8" class="empty">Nenhum frete cadastrado ainda.</td></tr>`}
      </tbody>
      <tfoot><tr>
        <td>Total do período</td>
        <td class="num">${total.viagens}</td>
        <td class="num">${U.money(total.receita)}</td>
        <td class="num">− ${U.money(total.variaveis)}</td>
        <td class="num">− ${U.money(total.fixasEmp)}</td>
        <td class="num"><b class="${vcls(total.resultadoEmp)}">${U.money(total.resultadoEmp)}</b></td>
        <td class="num">− ${U.money(total.fixasPes)}</td>
        <td class="num"><b class="${vcls(total.sobra)}">${U.money(total.sobra)}</b></td>
      </tr></tfoot>
    </table></div>
    <div class="legend-note">Receita, variáveis e fixas vêm do cadastro vivo no Supabase. Valores de competência do mês (não de caixa).</div>`;
  }

  function desenharChart(linhas) {
    if (chart) { chart.destroy(); chart = null; }
    if (typeof Chart === "undefined") return;
    const el = document.getElementById("ch-ano");
    if (!el) return;
    chart = new Chart(el, {
      data: {
        labels: linhas.map(l => mesLabel(l.chave)),
        datasets: [
          { type: "bar", label: "Receita", data: linhas.map(l => l.receita), backgroundColor: "#1d4ed8", borderRadius: 5, order: 2 },
          { type: "line", label: "Sobra do mês", data: linhas.map(l => l.sobra), borderColor: "#158a53",
            backgroundColor: "#158a53", tension: .3, pointRadius: 4, order: 1 },
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

  async function carregar() {
    try {
      const [fretes, contasFixas] = await Promise.all([window.LIVE.fretes(), window.LIVE.contasFixas()]);
      state.fretes = fretes; state.contasFixas = contasFixas; state.erro = null;
    } catch (e) {
      state.erro = "Não foi possível carregar o resultado: " + (e.message || e);
      document.getElementById("res-wrap").innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`;
      return;
    }
    const { linhas, total } = calcular(state.fretes, state.contasFixas);
    document.getElementById("res-wrap").innerHTML = montarHtml(linhas, total);
    desenharChart(linhas);
  }

  function teardown() { if (chart) { chart.destroy(); chart = null; } }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.resultado = {
    title: "Resultado anual",
    sub: "O período consolidado — receita, custos e sobra",
    render: view, bind: carregar, teardown,
  };
})();
