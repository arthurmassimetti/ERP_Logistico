/* Visão geral — enxuta: DDA, atalho pro financeiro e atenção operacional.
   Financeiro passou a viver todo dentro do Dashboard financeiro (#/painelfinanceiro),
   por isso não duplica mais KPI/lucro/vencimento aqui com dado estático da demo. */
(function () {
  const U = window.U;
  const HOJE = U.hojeISO();

  function view() {
    const ddaOk = sessionStorage.getItem("ddaOk") === HOJE;
    /* DDA e o atalho do financeiro são dinheiro: somem pra quem não tem esse acesso
       (operacional). Sem isto, sobrariam dois blocos que só levam a erro de permissão. */
    const veFinanceiro = !window.APP || window.APP.podeVer("painelfinanceiro");

    return `
    ${ddaOk || !veFinanceiro ? "" : `
    <div class="banner-dda" id="banner-dda">
      <div class="banner-ico">${U.icons.alert}</div>
      <div class="banner-body">
        <b>Lembrete diário: conferir a DDA no banco</b>
        <span>Abra o Itaú e o Bradesco, avalie os boletos que caíram na DDA e autorize os pagamentos do dia — assim nada vence sem você ver.</span>
      </div>
      <div class="banner-acts">
        <a class="btn btn-sm btn-primary" href="#/painelfinanceiro">ver dashboard financeiro</a>
        <button class="btn btn-sm" id="dda-feito">já conferi hoje</button>
      </div>
    </div>`}

    ${!veFinanceiro ? "" : `
    <div class="card card-pad mt">
      <div class="section-title" style="margin-top:0">Financeiro</div>
      <p style="color:var(--text-2); margin:0 0 12px">Contas a pagar, contas a receber, saldos e resultado do ano — tudo centralizado no Dashboard financeiro.</p>
      <a class="btn btn-sm btn-primary" href="#/painelfinanceiro">abrir Dashboard financeiro →</a>
    </div>`}

    <div class="section-title">Atenção operacional</div>
    <div class="strip-grid" id="strips"><div class="empty">Carregando…</div></div>`;
  }

  async function strips() {
    const strip = (ico, txt, sub, href, cls) => `
      <a class="strip ${cls || ""}" href="${href}">
        <span class="strip-ico">${U.icons[ico]}</span>
        <span class="strip-txt"><b>${txt}</b><span>${sub}</span></span>
        <span class="strip-arrow">→</span>
      </a>`;
    try {
      const [alertas, motoristas, roteiroHoje] = await Promise.all([
        window.buildAlertas(), window.LIVE.motoristas(), window.LIVE.roteiro(HOJE, HOJE),
      ]);
      const A = alertas.filter(a => !["Conta a pagar", "A receber"].includes(a.tipo));
      const frota = A.filter(a => ["Tacógrafo", "Troca de óleo", "Consumo"].includes(a.tipo));
      const vales = A.filter(a => a.tipo === "Vale em aberto");
      const emRota = roteiroHoje.length;

      document.getElementById("strips").innerHTML =
        strip("fleet", `${frota.length} pendência(s) na frota`,
          "tacógrafo, troca de óleo e consumo", "#/frota", frota.some(a => a.prioridade === "alta") ? "strip-danger" : "") +
        strip("truck", `${emRota} motorista(s) em rota hoje`,
          `de ${motoristas.length} motorista(s) ativos`, "#/roteiro") +
        (vales.length ? strip("wallet",
          vales.length === 1 ? `Vale em aberto — ${vales[0].entidade}` : `${vales.length} vales em aberto`,
          "ver saldo no extrato do motorista",
          vales.length === 1 ? vales[0].link : "#/motoristas", "strip-warn") : "");
    } catch (e) {
      document.getElementById("strips").innerHTML = `<div class="empty">Não foi possível carregar: ${U.esc(e.message || String(e))}</div>`;
    }
  }

  function bind() {
    strips();
    const b = document.getElementById("dda-feito");
    if (b) b.onclick = () => {
      sessionStorage.setItem("ddaOk", HOJE);
      document.getElementById("banner-dda").remove();
      U.toast("DDA conferida por hoje. O lembrete volta amanhã.");
    };
  }

  function statusTag(s) {
    if (s === "MEDICO") return '<span class="tag tag-warn">médico</span>';
    if (s === "A CONFIRMAR") return '<span class="tag tag-neutro">a confirmar</span>';
    if (s === "TCE") return '<span class="tag tag-info">TCE</span>';
    return `<span class="tag tag-ok">${U.esc(s)}</span>`;
  }
  window.rotStatusTag = statusTag;

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.dashboard = {
    title: "Visão geral",
    sub: "DDA do dia e atenção operacional",
    render: view, bind,
  };
})();
