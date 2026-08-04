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
      { id: "clientes", rotulo: "Clientes" },
      { id: "relatorios", rotulo: "Relatório de operação" },
    ] },
    { id: "financeiro-grupo", rotulo: "Financeiro", icone: "cash", itens: [
      { id: "painelfinanceiro", rotulo: "Dashboard financeiro" },
      { id: "financeiro", rotulo: "Contas a pagar" },
      { id: "receber", rotulo: "Contas a receber" },
      { id: "recorrentes", rotulo: "Contas fixas" },
      { id: "resultado", rotulo: "Resultado anual" },
    ] },
    { id: "frota-grupo", rotulo: "Frota", icone: "fleet", itens: [
      { id: "frota", rotulo: "Veículos" },
      { id: "manutencoes", rotulo: "Manutenções" },
      { id: "ocorrencias", rotulo: "Ocorrências" },
    ] },
    { id: "motoristas", rotulo: "Motoristas", icone: "users" },
    { id: "admin-grupo", rotulo: "Administração", icone: "settings", itens: [
      { id: "empresa", rotulo: "Dados da empresa" },
      { id: "usuarios", rotulo: "Usuários e acessos" },
    ] },
  ];

  /* O que cada papel enxerga no menu. Papel ausente deste mapa = sem restrição
     (admin continua vendo tudo). O RLS do banco já bloqueia o DADO em si — isto aqui
     é a camada de tela: não adianta mostrar "Contas a pagar" pra quem vai receber
     erro de permissão ao abrir.

     operacional = "CRUD da operação, zero dinheiro" (regra do dono): fica sem o grupo
     Financeiro inteiro e sem Administração (empresa/usuários são só de admin).

     financeiro ainda não está listado aqui de propósito — continua vendo o menu
     completo, como antes. Precisa da mesma limpeza, mas é decisão à parte. */
  const PERMISSOES = {
    operacional: [
      "dashboard",
      "roteiro", "fretes", "piso", "categorias", "clientes", "relatorios",
      "frota", "manutencoes", "ocorrencias",
      "motoristas",
    ],
  };

  function podeVer(id) {
    const perfil = window.PERFIL_ATUAL;
    if (!perfil) return true;              // papel ainda não carregou (a página está oculta até carregar)
    const lista = PERMISSOES[perfil.papel];
    return !lista || lista.includes(id);
  }

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
    /* tira do menu o que o papel não pode ver; grupo que ficou sem nenhum item some junto */
    const visivel = NAV
      .map(n => (n.itens ? { ...n, itens: n.itens.filter(i => podeVer(i.id)) } : n))
      .filter(n => (n.itens ? n.itens.length > 0 : podeVer(n.id)));

    document.getElementById("nav").innerHTML = visivel.map(n => {
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

    /* tirar do menu não basta: link salvo, atalho de outra tela ou hash digitada na mão
       chegariam aqui do mesmo jeito. Manda pra Visão geral em vez de abrir a tela. */
    if (!podeVer(rota)) {
      U.toast("Esta tela não faz parte do seu acesso.");
      location.hash = "#/dashboard";
      return;
    }

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
    /* badge é de conta a pagar — some pra quem não tem acesso ao financeiro */
    if (!podeVer("painelfinanceiro")) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.innerHTML = `${badgeUrgentes ? '<span class="dot"></span>' : ""}${badgeUrgentes} para pagar hoje`;
    btn.onclick = () => { location.hash = "#/painelfinanceiro"; window.scrollTo(0, 0); };
  }

  async function refreshBadges() {
    pintarBadge(); // mostra o último valor conhecido na hora, sem esperar a rede
    /* sem acesso ao financeiro, as duas consultas abaixo só voltariam erro de RLS */
    if (!window.LIVE || !podeVer("painelfinanceiro")) return;
    try {
      const [avulsas, fixas] = await Promise.all([window.LIVE.contasPagar(), window.LIVE.contasFixas()]);
      const hojeDia = new Date().getDate();
      const avulsasUrgentes = avulsas.filter(c => !c.pago_em && U.diasAte(c.vencimento) <= 0).length;
      const fixasHoje = fixas.filter(f => f.ativa && f.dia_venc === hojeDia).length;
      badgeUrgentes = avulsasUrgentes + fixasHoje;
    } catch (e) { /* badge não é crítico — mantém o último valor conhecido em caso de erro */ }
    pintarBadge();
  }

  /* o papel chega depois (auth.js busca o perfil de forma assíncrona), então o menu é
     montado uma vez sem ele e recomposto aqui. A página fica invisível até o auth.js
     resolver, então ninguém vê o menu completo piscar antes do filtro entrar. */
  function aplicarPerfil() {
    const { rota } = parseHash();
    if (!podeVer(rota)) { location.hash = "#/dashboard"; return; }  // dispara hashchange -> render()
    renderNav(rota);
    pintarBadge();
    refreshBadges();
  }

  window.APP = { rerender: render, refreshBadges, aplicarPerfil, podeVer };

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
