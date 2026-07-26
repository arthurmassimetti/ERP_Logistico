/* Manutenção — ordens de manutenção (fluxo de trabalho) + histórico de custo (livro-caixa,
   já existia no banco sem tela). Dados vivos do Supabase. */
(function () {
  const U = window.U;

  const STATUS_ORDEM = {
    aberta:       { r: "Aberta",       cls: "tag-warn" },
    em_andamento: { r: "Em andamento", cls: "tag-info" },
    concluida:    { r: "Concluída",    cls: "tag-ok" },
    cancelada:    { r: "Cancelada",    cls: "tag-neutro" },
  };
  const tagStatusOrdem = s => `<span class="tag ${(STATUS_ORDEM[s] || {}).cls || "tag-neutro"}">${U.esc((STATUS_ORDEM[s] || {}).r || s || "—")}</span>`;

  const TIPO_ORDEM = { preventiva: { r: "Preventiva", cls: "tag-ok" }, corretiva: { r: "Corretiva", cls: "tag-warn" } };
  const tagTipoOrdem = t => `<span class="tag ${(TIPO_ORDEM[t] || {}).cls || "tag-neutro"}">${U.esc((TIPO_ORDEM[t] || {}).r || t || "—")}</span>`;

  const state = {
    tab: "ordens",
    ordens: [], veiculos: [], historico: [],
    filtroStatus: "abertas", filtroPlaca: "",
    filtroDe: "", filtroAte: "",
    erro: null,
  };

  function horaBR(ts) {
    if (!ts) return "";
    return ts.slice(11, 16);
  }

  /* ---------------------------------------------------------------- abrir ordem */
  function formNovaOrdem() {
    const opcoes = state.veiculos.map(v =>
      `<option value="${v.placa}">${U.placaFmt(v.placa)}${v.tipo === "carreta" ? " (carreta)" : ""}</option>`).join("");
    U.openDrawer({
      titulo: "Nova ordem de manutenção",
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Veículo<span class="req">*</span></label><select id="of-veiculo">${opcoes}</select></div>
        <div><label>Tipo</label><select id="of-tipo">
          <option value="corretiva">Corretiva</option>
          <option value="preventiva">Preventiva</option>
        </select></div>
        <div><label>Km</label><input type="number" id="of-km" min="0"></div>
        <div class="full"><label>Problema<span class="req">*</span></label><textarea id="of-problema" rows="3" placeholder="o que foi identificado"></textarea></div>
        <div><label>Responsável</label><input id="of-responsavel" placeholder="quem está tratando"></div>
        <div><label>Oficina</label><input id="of-oficina" placeholder="opcional"></div>
        <div class="full"><label class="check-inline"><input type="checkbox" id="of-bloquear"> bloquear o veículo agora</label></div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório</div>
      </div>`,
      rodape: `
        <button class="btn" id="of-cancel">Cancelar</button>
        <button class="btn btn-primary" id="of-save">Abrir ordem</button>`,
    });
    document.getElementById("of-cancel").onclick = U.closeDrawer;
    document.getElementById("of-save").onclick = async () => {
      const veiculo_placa = document.getElementById("of-veiculo").value;
      const problema = document.getElementById("of-problema").value.trim();
      if (!veiculo_placa || !problema) { U.toast("Selecione o veículo e descreva o problema."); return; }
      const bloquear = document.getElementById("of-bloquear").checked;
      const btn = document.getElementById("of-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const { data: sessao } = await window.sb.auth.getUser();
        const ordem = await LIVE.criarOrdemManutencao({
          veiculo_placa,
          tipo: document.getElementById("of-tipo").value,
          problema,
          responsavel: document.getElementById("of-responsavel").value.trim() || null,
          oficina: document.getElementById("of-oficina").value.trim() || null,
          km: parseInt(document.getElementById("of-km").value, 10) || null,
          aberta_por: sessao && sessao.user ? sessao.user.id : null,
        });
        if (bloquear) {
          await LIVE.atualizarSituacaoVeiculo(veiculo_placa, {
            situacao: "bloqueado",
            situacao_motivo: `Ordem de manutenção #${ordem.numero} aberta`,
          });
        }
        U.closeDrawer();
        U.toast(`Ordem #${ordem.numero} aberta.`);
        carregar();
      } catch (e) {
        U.toast("Erro ao abrir ordem: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Abrir ordem";
      }
    };
  }

  /* ------------------------------------------------------- detalhe / concluir / cancelar */
  function formDetalheOrdem(o) {
    const aberta = o.status === "aberta" || o.status === "em_andamento";
    U.openDrawer({
      titulo: `Ordem #${o.numero} — ${U.placaFmt(o.veiculo_placa)}`,
      sub: `${tagTipoOrdem(o.tipo)} ${tagStatusOrdem(o.status)}`,
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Problema</label><div class="muted">${U.esc(o.problema)}</div></div>
        <div><label>Responsável</label><div class="muted">${U.esc(o.responsavel || "—")}</div></div>
        <div><label>Oficina</label><div class="muted">${U.esc(o.oficina || "—")}</div></div>
        <div><label>Km</label><div class="muted">${o.km ? U.num(o.km) + " km" : "—"}</div></div>
        <div><label>Aberta em</label><div class="muted">${U.dBRfull(o.aberta_em)} ${horaBR(o.aberta_em)}</div></div>
        ${aberta ? `
        <div class="full"><label>Serviço realizado</label><textarea id="of-servico" rows="3" placeholder="o que foi feito">${U.esc(o.servico_realizado || "")}</textarea></div>
        <div><label>Valor peças (R$)</label><input type="number" id="of-pecas" step="0.01" min="0" value="${o.valor_pecas || 0}"></div>
        <div><label>Valor mão de obra (R$)</label><input type="number" id="of-maoobra" step="0.01" min="0" value="${o.valor_mao_obra || 0}"></div>
        <div class="full"><label class="check-inline"><input type="checkbox" id="of-liberar"> liberar o veículo ao concluir</label></div>
        ` : `
        <div class="full"><label>Serviço realizado</label><div class="muted">${U.esc(o.servico_realizado || "—")}</div></div>
        <div><label>Custo total</label><div class="muted">${U.money(o.valor_total)}</div></div>
        ${o.concluida_em ? `<div><label>Concluída em</label><div class="muted">${U.dBRfull(o.concluida_em)} ${horaBR(o.concluida_em)}</div></div>` : ""}
        `}
      </div>`,
      rodape: aberta ? `
        <button class="btn" id="of-fechar">Fechar</button>
        <button class="btn" id="of-cancelar">Cancelar ordem</button>
        <button class="btn btn-primary" id="of-concluir">Concluir</button>`
        : `<button class="btn" id="of-fechar">Fechar</button>`,
    });
    document.getElementById("of-fechar").onclick = U.closeDrawer;
    if (!aberta) return;

    document.getElementById("of-cancelar").onclick = async () => {
      try {
        await LIVE.atualizarOrdemManutencao(o.id, { status: "cancelada" });
        U.closeDrawer();
        U.toast("Ordem cancelada.");
        carregar();
      } catch (e) { U.toast("Erro ao cancelar: " + (e.message || e)); }
    };
    document.getElementById("of-concluir").onclick = async () => {
      const servico_realizado = document.getElementById("of-servico").value.trim();
      if (!servico_realizado) { U.toast("Descreva o serviço realizado."); return; }
      const liberar_veiculo = document.getElementById("of-liberar").checked;
      const btn = document.getElementById("of-concluir");
      btn.disabled = true; btn.textContent = "Concluindo…";
      try {
        await LIVE.concluirOrdemManutencao(o.id, {
          servico_realizado,
          valor_pecas: parseFloat(document.getElementById("of-pecas").value) || 0,
          valor_mao_obra: parseFloat(document.getElementById("of-maoobra").value) || 0,
          liberar_veiculo,
        });
        U.closeDrawer();
        U.toast("Ordem concluída." + (liberar_veiculo ? " Veículo liberado." : ""));
        carregar();
      } catch (e) {
        U.toast("Erro ao concluir: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Concluir";
      }
    };
  }

  /* ---------------------------------------------------------------- tab Ordens */
  function filtrarOrdens() {
    return state.ordens.filter(o => {
      if (state.filtroStatus === "abertas" && !["aberta", "em_andamento"].includes(o.status)) return false;
      if (state.filtroStatus === "concluida" && o.status !== "concluida") return false;
      if (state.filtroStatus === "cancelada" && o.status !== "cancelada") return false;
      if (state.filtroPlaca && o.veiculo_placa !== state.filtroPlaca) return false;
      return true;
    });
  }

  function renderOrdens(alvo) {
    const lista = filtrarOrdens();
    alvo.innerHTML = `
      <div class="filters">
        <div class="field"><label>Status</label><select id="mo-status">
          <option value="abertas" ${state.filtroStatus === "abertas" ? "selected" : ""}>Abertas</option>
          <option value="todas" ${state.filtroStatus === "todas" ? "selected" : ""}>Todas</option>
          <option value="concluida" ${state.filtroStatus === "concluida" ? "selected" : ""}>Concluídas</option>
          <option value="cancelada" ${state.filtroStatus === "cancelada" ? "selected" : ""}>Canceladas</option>
        </select></div>
        <div class="field"><label>Veículo</label><select id="mo-placa">
          <option value="">todos</option>
          ${state.veiculos.map(v => `<option value="${v.placa}" ${state.filtroPlaca === v.placa ? "selected" : ""}>${U.placaFmt(v.placa)}</option>`).join("")}
        </select></div>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="mo-nova">+ Nova ordem</button>
      </div>
      <div id="mo-tbl">
        ${lista.length ? `
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Nº</th><th>Veículo</th><th>Tipo</th><th>Problema</th><th>Oficina / responsável</th><th class="num">Valor total</th><th>Status</th><th>Aberta em</th></tr></thead>
          <tbody>
            ${lista.map(o => `
              <tr class="clickable" data-id="${o.id}">
                <td class="mono">#${o.numero}</td>
                <td class="mono">${U.placaFmt(o.veiculo_placa)}</td>
                <td>${tagTipoOrdem(o.tipo)}</td>
                <td><div class="td-main">${U.esc((o.problema || "").slice(0, 60))}${(o.problema || "").length > 60 ? "…" : ""}</div></td>
                <td>${U.esc(o.oficina || o.responsavel || "—")}</td>
                <td class="num">${o.status === "cancelada" ? "—" : U.money(o.valor_total)}</td>
                <td>${tagStatusOrdem(o.status)}</td>
                <td class="mono">${U.dBR(o.aberta_em)}</td>
              </tr>`).join("")}
          </tbody>
        </table></div>`
        : `<div class="empty">${state.erro ? U.esc(state.erro) : "Nenhuma ordem para os filtros selecionados."}</div>`}
      </div>`;

    document.getElementById("mo-status").onchange = e => { state.filtroStatus = e.target.value; renderOrdens(alvo); };
    document.getElementById("mo-placa").onchange = e => { state.filtroPlaca = e.target.value; renderOrdens(alvo); };
    document.getElementById("mo-nova").onclick = formNovaOrdem;
    alvo.querySelectorAll("tr.clickable").forEach(tr => {
      tr.onclick = () => {
        const o = state.ordens.find(x => x.id === tr.dataset.id);
        if (o) formDetalheOrdem(o);
      };
    });
  }

  /* ---------------------------------------------------------------- tab Histórico */
  function filtrarHistorico() {
    return state.historico.filter(m => {
      if (state.filtroPlaca && m.veiculo_placa !== state.filtroPlaca) return false;
      if (state.filtroDe && m.data < state.filtroDe) return false;
      if (state.filtroAte && m.data > state.filtroAte) return false;
      return true;
    });
  }

  function renderHistorico(alvo) {
    const lista = filtrarHistorico();
    const total = U.sum(lista, m => m.valor);
    alvo.innerHTML = `
      <div class="filters">
        <div class="field"><label>Veículo</label><select id="mh-placa">
          <option value="">todos</option>
          ${state.veiculos.map(v => `<option value="${v.placa}" ${state.filtroPlaca === v.placa ? "selected" : ""}>${U.placaFmt(v.placa)}</option>`).join("")}
        </select></div>
        <div class="field"><label>De</label><input type="date" id="mh-de" value="${state.filtroDe}"></div>
        <div class="field"><label>Até</label><input type="date" id="mh-ate" value="${state.filtroAte}"></div>
      </div>
      <div class="legend-note">${lista.length} registro(s) · total ${U.money(total)}</div>
      <div class="table-wrap mt">
        <table class="tbl">
          <thead><tr><th>Data</th><th>Veículo</th><th>Serviço</th><th>Oficina</th><th>OS/NF</th><th class="num">Km</th><th class="num">Valor</th></tr></thead>
          <tbody>
            ${lista.length ? lista.slice(0, 200).map(m => `
              <tr>
                <td class="mono">${U.dBR(m.data)}</td>
                <td class="mono">${U.placaFmt(m.veiculo_placa)}</td>
                <td>${U.esc(m.servico || "—")}</td>
                <td>${U.esc(m.oficina || "—")}</td>
                <td class="mono">${U.esc(m.os_nf || "—")}</td>
                <td class="num">${m.km ? U.num(m.km) : "—"}</td>
                <td class="num">${U.money(m.valor)}</td>
              </tr>`).join("") : `<tr><td colspan="7" class="empty">Nenhum registro para os filtros.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${lista.length > 200 ? `<div class="legend-note">Mostrando os 200 mais recentes de ${lista.length}.</div>` : ""}`;

    document.getElementById("mh-placa").onchange = e => { state.filtroPlaca = e.target.value; renderHistorico(alvo); };
    document.getElementById("mh-de").onchange = e => { state.filtroDe = e.target.value; renderHistorico(alvo); };
    document.getElementById("mh-ate").onchange = e => { state.filtroAte = e.target.value; renderHistorico(alvo); };
  }

  /* ---------------------------------------------------------------- shell / abas */
  function view() {
    return `
    <div class="tabs mt" id="manut-tabs">
      <button class="btn ${state.tab === "ordens" ? "btn-primary" : ""}" id="mt-tab-ordens">Ordens</button>
      <button class="btn ${state.tab === "historico" ? "btn-primary" : ""}" id="mt-tab-historico">Histórico</button>
    </div>
    <div class="mt" id="manut-conteudo"><div class="empty">Carregando…</div></div>`;
  }

  function renderAba() {
    document.getElementById("mt-tab-ordens").className = "btn" + (state.tab === "ordens" ? " btn-primary" : "");
    document.getElementById("mt-tab-historico").className = "btn" + (state.tab === "historico" ? " btn-primary" : "");
    const alvo = document.getElementById("manut-conteudo");
    if (state.erro) { alvo.innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`; return; }
    if (state.tab === "ordens") renderOrdens(alvo); else renderHistorico(alvo);
  }

  async function carregar() {
    try {
      const [ordens, veiculos, historico] = await Promise.all([
        LIVE.ordensManutencao(), LIVE.veiculos(true), LIVE.historicoManutencoes(),
      ]);
      state.ordens = ordens; state.veiculos = veiculos; state.historico = historico;
      state.erro = null;
    } catch (e) {
      state.erro = "Não foi possível carregar as manutenções: " + (e.message || e);
    }
    renderAba();
  }

  function bind(params) {
    state.filtroPlaca = (params && params.placa) || "";
    document.getElementById("mt-tab-ordens").onclick = () => { state.tab = "ordens"; renderAba(); };
    document.getElementById("mt-tab-historico").onclick = () => { state.tab = "historico"; renderAba(); };
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.manutencoes = {
    title: "Manutenções",
    sub: "Ordens de manutenção e histórico de custo",
    render: view, bind,
  };
})();
