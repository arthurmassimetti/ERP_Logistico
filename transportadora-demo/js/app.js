/* Shell do app — navegação, roteador hash e utilidades globais */
(function () {
  const U = window.U, VIEWS = window.VIEWS;

  const NAV = [
    { id: "dashboard", rotulo: "Visão geral", icone: "home" },
    { id: "operacao-grupo", rotulo: "Operação", icone: "truck", itens: [
      { id: "roteiro", rotulo: "Roteiro diário" },
      { id: "fretes", rotulo: "Fretes" },
      { id: "piso", rotulo: "Piso mínimo ANTT" },
      { id: "categorias", rotulo: "Categoria de carga" },
      { id: "relatorios", rotulo: "Relatório de operação" },
    ] },
    { id: "financeiro-grupo", rotulo: "Financeiro", icone: "cash", itens: [
      { id: "painelfinanceiro", rotulo: "Dashboard financeiro" },
      { id: "financeiro", rotulo: "Contas a pagar" },
      { id: "receber", rotulo: "Contas a receber" },
      { id: "recorrentes", rotulo: "Fixas — empresa" },
      { id: "recorrentes-pessoal", rotulo: "Fixas — pessoal" },
      { id: "resultado", rotulo: "Resultado anual" },
    ] },
    { id: "frota-grupo", rotulo: "Frota", icone: "fleet", itens: [
      { id: "frota", rotulo: "Veículos" },
      { id: "manutencoes", rotulo: "Manutenções" },
      { id: "ocorrencias", rotulo: "Ocorrências" },
    ] },
    { id: "motoristas", rotulo: "Motoristas", icone: "users" },
  ];

  let atual = null;
  let gruposManual = {}; // { [grupoId]: true|false } — chave ausente = automático (segue a rota atual)

  function parseHash() {
    const h = (location.hash || "#/dashboard").replace(/^#\//, "");
    const [pathQ, query] = h.split("?");
    const parts = pathQ.split("/").filter(Boolean);
    const params = {};
    if (query) query.split("&").forEach(kv => {
      const [k, v] = kv.split("=");
      params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
    return { rota: parts[0] || "dashboard", sub: parts[1] || null, params };
  }

  function renderNav(rotaAtiva) {
    document.getElementById("nav").innerHTML = NAV.map(n => {
      if (n.itens) {
        const dentro = n.itens.some(i => i.id === rotaAtiva);
        const manual = gruposManual[n.id];
        const aberto = manual === undefined ? dentro : manual;
        return `
        <button class="nav-item nav-group ${dentro ? "active-parent" : ""}" data-grupo="${n.id}" type="button">
          ${U.icons[n.icone]}<span>${n.rotulo}</span>
          <span class="nav-chevron ${aberto ? "open" : ""}">${U.icons.chevron}</span>
        </button>
        <div class="nav-sub ${aberto ? "open" : ""}">
          ${n.itens.map(i => `
            <a class="nav-item nav-subitem ${i.id === rotaAtiva ? "active" : ""}" href="#/${i.id}"><span>${i.rotulo}</span></a>`).join("")}
        </div>`;
      }
      return `
      <a class="nav-item ${n.id === rotaAtiva ? "active" : ""}" href="#/${n.id}">
        ${U.icons[n.icone]}<span>${n.rotulo}</span>
      </a>`;
    }).join("");

    document.querySelectorAll("[data-grupo]").forEach(b => b.onclick = () => {
      const grupo = NAV.find(n => n.id === b.dataset.grupo);
      const dentro = grupo.itens.some(i => i.id === rotaAtiva);
      const manualAtual = gruposManual[grupo.id];
      const abertoAtual = manualAtual === undefined ? dentro : manualAtual;
      gruposManual[grupo.id] = !abertoAtual;
      renderNav(rotaAtiva);
    });
  }

  function render() {
    const { rota, sub, params } = parseHash();
    const v = VIEWS[rota] || VIEWS.dashboard;

    if (atual && VIEWS[atual] && VIEWS[atual].teardown) VIEWS[atual].teardown();
    atual = rota;

    renderNav(rota);
    document.getElementById("page-title").textContent = v.title;
    document.getElementById("page-sub").textContent = v.sub || "";

    const content = document.getElementById("content");
    if (sub && v.detalhe) {
      content.innerHTML = v.detalhe(sub);
      document.getElementById("page-title").textContent = v.tituloDetalhe || (v.title + " · detalhe");
      if (v.bindDetalhe) v.bindDetalhe(sub);
    } else {
      content.innerHTML = v.render(params);
      if (v.bind) v.bind(params);
    }

    refreshBadges();

    /* fecha o menu móvel ao navegar */
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("backdrop").classList.remove("show");
    window.scrollTo(0, 0);
  }

  /* badge "X para pagar hoje" — dado vivo (contas_pagar + contas_fixas reais),
     não mais o motor estático window.VENC (congelado na data do import da planilha) */
  let badgeUrgentes = 0;

  function pintarBadge() {
    const btn = document.getElementById("btn-alertas");
    btn.innerHTML = `${badgeUrgentes ? '<span class="dot"></span>' : ""}${badgeUrgentes} para pagar hoje`;
    btn.onclick = () => { location.hash = "#/painelfinanceiro"; window.scrollTo(0, 0); };
  }

  async function refreshBadges() {
    pintarBadge(); // mostra o último valor conhecido na hora, sem esperar a rede
    if (!window.LIVE) return;
    try {
      const [avulsas, fixas] = await Promise.all([window.LIVE.contasPagar(), window.LIVE.contasFixas()]);
      const hojeDia = new Date().getDate();
      const avulsasUrgentes = avulsas.filter(c => !c.pago_em && U.diasAte(c.vencimento) <= 0).length;
      const fixasHoje = fixas.filter(f => f.ativa && f.dia_venc === hojeDia).length;
      badgeUrgentes = avulsasUrgentes + fixasHoje;
    } catch (e) { /* badge não é crítico — mantém o último valor conhecido em caso de erro */ }
    pintarBadge();
  }

  window.APP = { rerender: render, refreshBadges };

  /* menu móvel */
  document.getElementById("hamburger").onclick = () => {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("backdrop").classList.add("show");
  };
  document.getElementById("backdrop").onclick = () => {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("backdrop").classList.remove("show");
  };

  /* fecha modal com ESC */
  document.addEventListener("keydown", e => { if (e.key === "Escape") { U.closeModal(); U.closeDrawer(); } });

  window.addEventListener("hashchange", render);
  render();
})();
