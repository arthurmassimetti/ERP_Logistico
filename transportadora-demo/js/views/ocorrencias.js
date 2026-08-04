/* Ocorrências — fila de relatos de problema enviados pelos motoristas.
   O motorista só relata (insert-only, ver patch_009); diagnóstico, bloqueio,
   abertura de ordem e resolução são sempre feitos aqui, pelo responsável. */
(function () {
  const U = window.U;

  const URGENCIAS = { alta: { r: "Alta", cls: "tag-danger" }, media: { r: "Média", cls: "tag-warn" }, baixa: { r: "Baixa", cls: "tag-neutro" } };
  const tagUrgencia = u => `<span class="tag ${(URGENCIAS[u] || {}).cls || "tag-neutro"}">${U.esc((URGENCIAS[u] || {}).r || u || "—")}</span>`;

  const STATUS = {
    aberta: { r: "Aberta", cls: "tag-warn" }, em_analise: { r: "Em análise", cls: "tag-info" },
    resolvida: { r: "Resolvida", cls: "tag-ok" }, descartada: { r: "Descartada", cls: "tag-neutro" },
  };
  const tagStatus = s => `<span class="tag ${(STATUS[s] || {}).cls || "tag-neutro"}">${U.esc((STATUS[s] || {}).r || s || "—")}</span>`;

  const TIPOS = { pneu: "Pneu", freio: "Freio", luz: "Luz", motor: "Motor", eletrica: "Elétrica", outro: "Outro" };
  const rotuloTipo = t => TIPOS[t] || t || "—";

  const ORDEM_URG = { alta: 0, media: 1, baixa: 2 };

  /* checklist_id vem preenchido quando a ocorrência nasceu sozinha de um item "problema" no
     checklist de início de viagem (patch_017, rpc iniciar_viagem) — distingue do relato manual
     feito na aba "Relatar" do portal do motorista */
  const origemOcorrencia = o => o.checklist_id
    ? '<span class="tag tag-info">via checklist</span>'
    : '<span class="tag tag-neutro">relato manual</span>';

  const state = { lista: [], filtroStatus: "ativas", erro: null };

  function filtrar() {
    return state.lista.filter(o => {
      if (state.filtroStatus === "ativas") return !["resolvida", "descartada"].includes(o.status);
      if (state.filtroStatus === "todas") return true;
      return o.status === state.filtroStatus;
    }).slice().sort((a, b) =>
      (ORDEM_URG[a.urgencia] ?? 3) - (ORDEM_URG[b.urgencia] ?? 3) || String(b.criado_em).localeCompare(String(a.criado_em)));
  }

  /* ---------------------------------------------------------------- detalhe */
  function formOcorrencia(o) {
    const finalizavel = !["resolvida", "descartada"].includes(o.status);
    const viagem = o.roteiro
      ? `${U.dBR(o.roteiro.data)} · ${[o.roteiro.destino_local, o.roteiro.destino_cidade, o.roteiro.destino_uf].filter(Boolean).join(" · ") || "sem destino informado"}`
      : "—";

    U.openDrawer({
      titulo: `Ocorrência — ${U.esc(o.motoristas ? o.motoristas.nome : "—")}`,
      sub: `${tagUrgencia(o.urgencia)} ${tagStatus(o.status)} ${origemOcorrencia(o)}`,
      corpo: `
      <div class="form-grid">
        <div><label>Veículo</label><div class="muted">${o.veiculos ? U.placaFmt(o.veiculos.placa) : "—"}</div></div>
        <div><label>Tipo</label><div class="muted">${U.esc(rotuloTipo(o.tipo))}</div></div>
        <div class="full"><label>Descrição</label><div class="muted">${U.esc(o.descricao || "—")}</div></div>
        <div class="full"><label>Viagem relacionada</label><div class="muted">${U.esc(viagem)}</div></div>
        <div><label>Relatado em</label><div class="muted">${U.dBRfull(o.criado_em)} ${(o.criado_em || "").slice(11, 16)}</div></div>
        ${!finalizavel ? `<div class="full"><label>Resolução</label><div class="muted">${U.esc(o.resolucao || "—")}</div></div>` : ""}
        ${finalizavel ? `<div class="full"><label>Observação / justificativa</label><textarea id="oc-nota" rows="2" placeholder="opcional pra resolver, recomendado pra descartar"></textarea></div>` : ""}
      </div>`,
      rodape: finalizavel ? `
        <button class="btn" id="oc-fechar">Fechar</button>
        <button class="btn" id="oc-descartar">Descartar</button>
        <button class="btn" id="oc-resolver">Marcar resolvida</button>
        ${o.veiculos ? `<button class="btn" id="oc-bloquear">Bloquear veículo</button>` : ""}
        <button class="btn btn-primary" id="oc-abrir-ordem">Abrir ordem</button>`
        : `<button class="btn" id="oc-fechar">Fechar</button>`,
    });

    document.getElementById("oc-fechar").onclick = U.closeDrawer;
    if (!finalizavel) return;

    document.getElementById("oc-descartar").onclick = async () => {
      const nota = document.getElementById("oc-nota").value.trim();
      if (!nota) { U.toast("Descreva o motivo do descarte."); return; }
      try {
        const { data: sessao } = await window.sb.auth.getUser();
        await LIVE.atualizarOcorrencia(o.id, {
          status: "descartada", resolvido_em: new Date().toISOString(),
          resolvido_por: sessao && sessao.user ? sessao.user.id : null, resolucao: nota,
        });
        U.closeDrawer(); U.toast("Ocorrência descartada."); carregar();
      } catch (e) { U.toast("Erro: " + (e.message || e)); }
    };

    document.getElementById("oc-resolver").onclick = async () => {
      try {
        const nota = document.getElementById("oc-nota").value.trim();
        const { data: sessao } = await window.sb.auth.getUser();
        await LIVE.atualizarOcorrencia(o.id, {
          status: "resolvida", resolvido_em: new Date().toISOString(),
          resolvido_por: sessao && sessao.user ? sessao.user.id : null,
          resolucao: nota || "Resolvida sem abertura de ordem.",
        });
        U.closeDrawer(); U.toast("Ocorrência marcada como resolvida."); carregar();
      } catch (e) { U.toast("Erro: " + (e.message || e)); }
    };

    const btnBloquear = document.getElementById("oc-bloquear");
    if (btnBloquear) btnBloquear.onclick = async () => {
      try {
        await LIVE.atualizarSituacaoVeiculo(o.veiculos.placa, {
          situacao: "bloqueado",
          situacao_motivo: `Bloqueado por ocorrência relatada por ${o.motoristas ? o.motoristas.nome : "motorista"}`,
        });
        await LIVE.atualizarOcorrencia(o.id, { status: "em_analise" });
        U.closeDrawer(); U.toast("Veículo bloqueado."); carregar();
      } catch (e) { U.toast("Erro: " + (e.message || e)); }
    };

    document.getElementById("oc-abrir-ordem").onclick = () => {
      U.closeDrawer();
      window.abrirOrdemDeOcorrencia(o);
    };
  }

  /* ---------------------------------------------------------------- lista */
  function tabela() {
    const lista = filtrar();
    const alvo = document.getElementById("oc-tbl");
    if (!lista.length) {
      alvo.innerHTML = `<div class="empty">${state.erro ? U.esc(state.erro) : "Nenhuma ocorrência para os filtros."}</div>`;
      return;
    }
    alvo.innerHTML = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Urgência</th><th>Motorista</th><th>Veículo</th><th>Tipo</th><th>Descrição</th><th>Origem</th><th>Status</th><th>Relatada em</th></tr></thead>
        <tbody>
          ${lista.map(o => `
            <tr class="clickable" data-id="${o.id}">
              <td>${tagUrgencia(o.urgencia)}</td>
              <td>${U.esc(o.motoristas ? o.motoristas.nome : "—")}</td>
              <td class="mono">${o.veiculos ? U.placaFmt(o.veiculos.placa) : "—"}</td>
              <td>${U.esc(rotuloTipo(o.tipo))}</td>
              <td><div class="td-main">${U.esc((o.descricao || "").slice(0, 50))}${(o.descricao || "").length > 50 ? "…" : ""}</div></td>
              <td>${origemOcorrencia(o)}</td>
              <td>${tagStatus(o.status)}</td>
              <td class="mono">${U.dBR(o.criado_em)}</td>
            </tr>`).join("")}
        </tbody>
      </table></div>`;
    alvo.querySelectorAll("tr.clickable").forEach(tr => {
      tr.onclick = () => { const o = state.lista.find(x => x.id === tr.dataset.id); if (o) formOcorrencia(o); };
    });
  }

  function view() {
    return `
    <div class="filters">
      <div class="field"><label>Status</label><select id="oc-status">
        <option value="ativas">Ativas (aberta/em análise)</option>
        <option value="todas">Todas</option>
        <option value="aberta">Só abertas</option>
        <option value="resolvida">Resolvidas</option>
        <option value="descartada">Descartadas</option>
      </select></div>
    </div>
    <div id="oc-tbl"><div class="empty">Carregando…</div></div>`;
  }

  async function carregar() {
    try {
      state.lista = await LIVE.ocorrencias();
      state.erro = null;
    } catch (e) {
      state.lista = [];
      state.erro = "Não foi possível carregar as ocorrências: " + (e.message || e);
    }
    tabela();
  }

  function bind() {
    document.getElementById("oc-status").onchange = e => { state.filtroStatus = e.target.value; tabela(); };
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.ocorrencias = {
    title: "Ocorrências",
    sub: "Relatos dos motoristas sobre problemas nos veículos",
    render: view, bind,
  };
})();
