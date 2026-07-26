/* Portal do motorista — página enxuta e separada do painel administrativo.
   Só usa dados vivos do Supabase; o RLS já garante que só vem o que é do próprio motorista. */
(function () {
  const U = window.U;
  const sb = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.publishableKey);
  window.sb = sb;

  const HOJE = U.hojeISO();

  function tagStatus(status) {
    const s = (status || "").toLowerCase();
    if (s === "confirmado") return '<span class="tag tag-ok">confirmado</span>';
    if (s === "em andamento") return '<span class="tag tag-info">em andamento</span>';
    if (s === "concluído" || s === "concluido") return '<span class="tag tag-neutro">concluído</span>';
    if (s === "a confirmar") return '<span class="tag tag-warn">a confirmar</span>';
    return `<span class="tag tag-neutro">${U.esc(status || "—")}</span>`;
  }

  function localCompleto(r) {
    return [r.destino_local, r.destino_cidade, r.destino_uf].filter(Boolean).join(" · ") || "sem destino informado";
  }

  async function carregarTudo() {
    const [roteiroHoje, roteiroProximo, fretes, vales] = await Promise.all([
      LIVE.roteiro(HOJE, HOJE),
      LIVE.roteiro(U.addDias(HOJE, 1), U.addDias(HOJE, 14)),
      LIVE.meusFretes(30),
      LIVE.meusVales(),
    ]);

    /* hoje */
    const alvoHoje = document.getElementById("mot-hoje");
    if (roteiroHoje.length) {
      alvoHoje.innerHTML = roteiroHoje.map(r => `
        <div class="mot-card">
          <div class="mot-linha1">${U.esc(localCompleto(r))}</div>
          <div class="mot-linha3">${tagStatus(r.status)}</div>
          ${r.observacao ? `<div class="mot-linha2">${U.esc(r.observacao)}</div>` : ""}
        </div>`).join("");
    } else {
      alvoHoje.innerHTML = `<div class="mot-card"><div class="mot-linha1">Sem entrega hoje</div>
        <div class="mot-linha2">Você está disponível.</div></div>`;
    }

    /* próximos dias */
    const alvoProx = document.getElementById("mot-proximos");
    alvoProx.innerHTML = roteiroProximo.length
      ? roteiroProximo.map(r => `
        <div class="mot-card">
          <div class="mot-linha1">${U.dBRfull(r.data)}</div>
          <div class="mot-linha2">${U.esc(localCompleto(r))}</div>
          <div class="mot-linha3">${tagStatus(r.status)}</div>
        </div>`).join("")
      : `<div class="empty">Nenhuma entrega programada. Avise a base se não receber uma logo.</div>`;

    /* KPIs do mês — o que ele ganhou nas viagens, menos os vales já pedidos no mês */
    const mesAtual = HOJE.slice(0, 7);
    const fretesMes = fretes.filter(f => f.data && f.data.slice(0, 7) === mesAtual);
    const valesMes = vales.filter(v => v.data && v.data.slice(0, 7) === mesAtual);
    const comissaoMes = U.sum(fretesMes, f => f.comissao);
    const diariaMes = U.sum(fretesMes, f => f.diaria);
    const ganhoMes = comissaoMes + diariaMes;
    const valeMes = U.sum(valesMes, v => v.valor);
    document.getElementById("mot-kpis").innerHTML = `
      <div class="mot-kpi"><b>${fretesMes.length}</b><span>viagens no mês</span></div>
      <div class="mot-kpi"><b>${U.money(comissaoMes)}</b><span>comissões</span></div>
      <div class="mot-kpi"><b>${U.money(diariaMes)}</b><span>diárias</span></div>
      <div class="mot-kpi"><b>${U.money(ganhoMes)}</b><span>ganho no mês</span></div>
      <div class="mot-kpi"><b class="neg-v">− ${U.money(valeMes)}</b><span>vale descontado no mês</span></div>
      <div class="mot-kpi"><b class="pos-v">${U.money(ganhoMes - valeMes)}</b><span>a receber no fim do mês</span></div>`;

    /* fretes recentes — sem valor do frete, só o que é do motorista */
    const alvoFretes = document.getElementById("mot-fretes");
    alvoFretes.innerHTML = fretes.length
      ? fretes.slice(0, 15).map(f => `
        <div class="mot-card">
          <div class="mot-linha1">${U.esc(f.origem || "—")} → ${U.esc(f.destino || "—")}</div>
          <div class="mot-linha2">${U.dBRfull(f.data)} · ${U.esc(f.transportadora || "—")}</div>
          <div class="mot-linha3">
            <span class="tag tag-ok">comissão ${U.money(f.comissao)}</span>
            ${f.diaria ? `<span class="tag tag-info">diária ${U.money(f.diaria)}</span>` : ""}
          </div>
        </div>`).join("")
      : `<div class="empty">Nenhum frete lançado ainda.</div>`;

    /* vales */
    const alvoVales = document.getElementById("mot-vales");
    alvoVales.innerHTML = vales.length
      ? vales.map(v => `
        <div class="mot-card">
          <div class="mot-linha1">${U.money(v.valor)}</div>
          <div class="mot-linha2">${U.dBRfull(v.data)} · ${U.esc(v.descricao || "vale")}</div>
          <div class="mot-linha3">${v.saldo > 0 ? `<span class="tag tag-warn">saldo a descontar ${U.money(v.saldo)}</span>` : '<span class="tag tag-ok">quitado</span>'}</div>
        </div>`).join("")
      : `<div class="empty">Nenhum vale registrado.</div>`;
  }

  async function iniciar() {
    const { data } = await sb.auth.getSession();
    if (!data.session) { location.replace("login.html"); return; }

    const { data: perfil } = await sb.from("perfis").select("nome,papel").eq("user_id", data.session.user.id).single();
    if (perfil && perfil.papel !== "motorista") {
      // login de equipe (admin/financeiro/operacional) caiu aqui por engano -> manda pro painel completo
      location.replace("index.html");
      return;
    }
    document.getElementById("mot-nome").textContent = perfil ? perfil.nome : (data.session.user.email || "Motorista");

    document.getElementById("btn-sair").onclick = async () => {
      await sb.auth.signOut();
      location.replace("login.html");
    };

    try {
      await carregarTudo();
    } catch (e) {
      document.querySelectorAll(".mot-content .empty").forEach(el => {
        el.textContent = "Não foi possível carregar: " + (e.message || e);
      });
    }
  }

  iniciar();
})();
