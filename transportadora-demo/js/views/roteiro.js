/* Roteiro Diário — agenda por motorista, carga de trabalho e alerta de "sem próxima rota".
   Dados vivos do Supabase (LIVE.roteiro / LIVE.motoristas). */
(function () {
  const U = window.U;
  const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
               "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

  function dBR(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}`;
  }
  function diaSemana(iso) {
    const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    return dias[new Date(iso + "T12:00:00").getDay()];
  }

  const HOJE = U.hojeISO();

  const state = {
    motoristas: [], roteiro: [], veiculos: [], erro: null, motoristaFiltro: "",
  };

  /* veículo hoje vinculado ao motorista da tarefa — não há coluna de veículo no
     roteiro (de propósito, sem tabela "viagens" nova), então o vínculo é sempre
     o atual, não necessariamente o que valia quando a tarefa foi cadastrada. */
  function veiculoDoMotorista(motoristaId) {
    return state.veiculos.find(v => v.motorista_id === motoristaId) || null;
  }

  function tagVeiculoComprometido(motoristaId) {
    const v = veiculoDoMotorista(motoristaId);
    if (!v || !v.situacao || v.situacao === "disponivel") return "";
    const info = U.situacaoVeiculoInfo(v.situacao);
    return ` <span class="tag tag-danger" title="${U.esc(v.situacao_motivo || "")}">veículo ${U.esc(info.rotulo)}</span>`;
  }

  function alertasVeiculoIndisponivel(ag) {
    const out = [];
    ag.forEach(b => {
      const v = veiculoDoMotorista(b.motorista.id);
      if (v && v.situacao && v.situacao !== "disponivel" && (b.hoje || b.futuras.length)) out.push({ ...b, veiculo: v });
    });
    return out;
  }

  function tagStatus(status) {
    const s = (status || "").toLowerCase();
    if (s === "confirmado") return '<span class="tag tag-ok">confirmado</span>';
    if (s === "em andamento") return '<span class="tag tag-info">em andamento</span>';
    if (s === "concluído" || s === "concluido") return '<span class="tag tag-neutro">concluído</span>';
    if (s === "a confirmar") return '<span class="tag tag-warn">a confirmar</span>';
    return `<span class="tag tag-neutro">${U.esc(status || "—")}</span>`; // valores antigos importados
  }

  function localCompleto(r) {
    const partes = [r.destino_local, r.destino_cidade, r.destino_uf].filter(Boolean);
    return partes.length ? partes.join(" · ") : "—";
  }

  /* destino_local guarda o nome da empresa/cliente daquela entrega (ex.: TOTALPLAST) */
  function empresaDe(r) {
    return (r && r.destino_local) || null;
  }

  function origemTexto(r) {
    const partes = [r.origem_local, r.origem_uf].filter(Boolean);
    return partes.length ? partes.join(" - ") : null;
  }

  function destinoTexto(r) {
    const partes = [r.destino_cidade, r.destino_uf].filter(Boolean);
    return partes.length ? partes.join(" - ") : null;
  }

  function rotaGeografica(r) {
    const o = origemTexto(r);
    const d = destinoTexto(r);
    if (!o && !d) return '<span class="muted">rota não informada</span>';
    return `${o ? U.esc(o) : '<span class="muted">origem?</span>'} <span class="rot-seta">→</span> ${d ? U.esc(d) : '<span class="muted">destino?</span>'}`;
  }

  /* agrupa o roteiro por motorista: atividade de hoje + próximas entregas */
  function agenda() {
    const mapa = new Map();
    state.motoristas.forEach(m => mapa.set(m.id, { motorista: m, hoje: null, futuras: [] }));
    state.roteiro.forEach(r => {
      const b = mapa.get(r.motorista_id);
      if (!b) return;
      if (r.data === HOJE) b.hoje = r;
      else if (r.data > HOJE) b.futuras.push(r);
    });
    mapa.forEach(b => b.futuras.sort((a, c) => a.data.localeCompare(c.data)));
    return mapa;
  }

  function alertasSemProximaRota(ag) {
    const out = [];
    ag.forEach(b => {
      if (b.hoje && b.futuras.length === 0) out.push(b);
    });
    return out;
  }

  function view() {
    return `
    <div id="rot-alertas"></div>

    <div class="section-title">Hoje — ${U.dBRfull(HOJE)} <span class="count-pill" id="rot-count-hoje"></span></div>
    <div id="rot-hoje"><div class="empty">Carregando roteiro…</div></div>

    <div class="section-title">Carga de trabalho por motorista</div>
    <div id="rot-carga"></div>

    <div class="section-title">Próximos dias <span class="count-pill" id="rot-count-prox"></span></div>
    <div class="filters">
      <div class="field"><label>Motorista</label>
        <select id="rf-mot"><option value="">todos</option></select></div>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="btn-nova-entrega" disabled>+ Nova entrega</button>
    </div>
    <div id="rot-proximos"></div>
    <div class="legend-note">Janela de 30 dias. Uma linha por entrega — o mesmo motorista pode ter mais de uma no período.</div>`;
  }

  function renderAlertas() {
    const ag = agenda();
    const sem = alertasSemProximaRota(ag);
    const indisponiveis = alertasVeiculoIndisponivel(ag);
    const alvo = document.getElementById("rot-alertas");
    if (!sem.length && !indisponiveis.length) { alvo.innerHTML = ""; return; }

    let html = "";
    if (indisponiveis.length) {
      html += `
      <div class="section-title grp-danger">⚠ Veículo indisponível com tarefa agendada</div>
      <div class="alert-list">
        ${indisponiveis.map(b => `
          <div class="alert-item p-alta">
            <div class="alert-ico">${U.icons.alert}</div>
            <div class="alert-body">
              <div class="alert-titulo">${U.esc(b.motorista.nome)} — veículo ${U.placaFmt(b.veiculo.placa)} está ${U.esc(U.situacaoVeiculoInfo(b.veiculo.situacao).rotulo)}</div>
              <div class="alert-desc">${b.veiculo.situacao_motivo ? U.esc(b.veiculo.situacao_motivo) + " · " : ""}${[
                b.hoje ? "tem entrega hoje" : "",
                b.futuras.length ? `${b.futuras.length} entrega(s) futura(s) agendada(s)` : "",
              ].filter(Boolean).join(" e ")}.</div>
            </div>
            <div class="alert-act"><a class="btn btn-sm btn-ghost" href="#/manutencoes?placa=${b.veiculo.placa}">ver manutenções →</a></div>
          </div>`).join("")}
      </div>`;
    }
    if (sem.length) {
      html += `
      <div class="section-title grp-danger">⚠ Atenção — motoristas sem próxima rota</div>
      <div class="alert-list">
        ${sem.map(b => `
          <div class="alert-item p-alta">
            <div class="alert-ico">${U.icons.alert}</div>
            <div class="alert-body">
              <div class="alert-titulo">${U.esc(b.motorista.nome)} não possui próxima rota após a atividade atual</div>
              <div class="alert-desc">Atividade de hoje: ${U.esc(localCompleto(b.hoje))}. Cadastre uma nova entrega para evitar tempo ocioso.</div>
            </div>
            <div class="alert-act"><button class="btn btn-sm btn-primary" data-abrir-form="${b.motorista.id}">+ nova entrega</button></div>
          </div>`).join("")}
      </div>`;
    }
    alvo.innerHTML = html;
    alvo.querySelectorAll("[data-abrir-form]").forEach(btn => {
      btn.onclick = () => formRoteiro(null, btn.dataset.abrirForm);
    });
  }

  function renderHoje() {
    const ag = agenda();
    document.getElementById("rot-count-hoje").textContent =
      `${[...ag.values()].filter(b => b.hoje).length} ocupado(s) · ${[...ag.values()].filter(b => !b.hoje).length} disponível(is)`;
    document.getElementById("rot-hoje").innerHTML = `<div class="rot-grid">
      ${[...ag.values()].map(b => {
        const empresa = b.hoje ? empresaDe(b.hoje) : null;
        const rodape = b.hoje
          ? (b.futuras.length ? `agendado: ${dBR(b.hoje.data)} · próx. ${dBR(b.futuras[0].data)}` : `agendado: ${dBR(b.hoje.data)} · ⚠ sem próxima`)
          : (b.futuras.length ? `próxima: ${dBR(b.futuras[0].data)}` : "—");
        return `
        <div class="rot-card clickable" data-editar="${b.hoje ? b.hoje.id : ""}" data-motorista="${b.motorista.id}">
          <div class="rot-nome">${U.esc(b.motorista.nome)}</div>
          ${empresa ? `<div class="rot-empresa">${U.esc(empresa)}</div>` : ""}
          <div class="rot-rota">${b.hoje ? rotaGeografica(b.hoje) : '<span class="muted">sem entrega hoje</span>'}</div>
          <div class="rot-foot">
            <span class="rot-uf">${rodape}</span>
            ${b.hoje ? tagStatus(b.hoje.status) : '<span class="tag tag-ok">disponível</span>'}
            ${tagVeiculoComprometido(b.motorista.id)}
          </div>
        </div>`;
      }).join("")}
    </div>`;
    document.querySelectorAll("#rot-hoje [data-editar]").forEach(el => {
      el.onclick = () => el.dataset.editar
        ? detalhe(el.dataset.editar)
        : formRoteiro(null, el.dataset.motorista);
    });
  }

  function renderCarga() {
    const ag = agenda();
    const linhas = [...ag.values()].sort((a, b) => b.futuras.length - a.futuras.length || (b.hoje ? 1 : 0) - (a.hoje ? 1 : 0));
    document.getElementById("rot-carga").innerHTML = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Motorista</th><th>Hoje</th><th class="num">Entregas (30 dias)</th><th>Próxima rota</th></tr></thead>
        <tbody>
          ${linhas.map(b => `
            <tr>
              <td class="td-main">${U.esc(b.motorista.nome)}${tagVeiculoComprometido(b.motorista.id)}</td>
              <td>${b.hoje ? tagStatus(b.hoje.status) : '<span class="tag tag-ok">disponível</span>'}</td>
              <td class="num">${b.futuras.length + (b.hoje ? 1 : 0)}</td>
              <td>${b.futuras.length
                ? `${dBR(b.futuras[0].data)} (${diaSemana(b.futuras[0].data)}) · ${U.esc(localCompleto(b.futuras[0]))}`
                : (b.hoje ? '<span class="tag tag-danger">sem próxima rota</span>' : '<span class="muted">nenhuma programada</span>')}</td>
            </tr>`).join("")}
        </tbody>
      </table></div>
      <div class="legend-note">Ordenado pela maior carga de trabalho primeiro — ajuda a ver quem está sobrecarregado e quem pode receber mais entregas.</div>`;
  }

  function renderProximos() {
    const futuras = state.roteiro
      .filter(r => r.data > HOJE)
      .filter(r => !state.motoristaFiltro || r.motorista_id === state.motoristaFiltro)
      .sort((a, b) => a.data.localeCompare(b.data));
    document.getElementById("rot-count-prox").textContent = `${futuras.length} entrega(s)`;
    if (!futuras.length) {
      document.getElementById("rot-proximos").innerHTML = `<div class="empty">${state.erro ? U.esc(state.erro) : "Nenhuma entrega programada para os próximos dias."}</div>`;
      return;
    }
    document.getElementById("rot-proximos").innerHTML = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Data</th><th>Motorista</th><th>Destino</th><th>Estado</th><th>Status</th></tr></thead>
        <tbody>
          ${futuras.map(r => `
            <tr class="clickable" data-id="${r.id}">
              <td class="mono">${U.dBRfull(r.data)} <span class="td-sub">${diaSemana(r.data)}</span></td>
              <td>${U.esc(r.motoristas ? r.motoristas.nome : "—")}</td>
              <td>${U.esc(r.destino_local || "—")}${r.destino_cidade ? ` <span class="td-sub">· ${U.esc(r.destino_cidade)}</span>` : ""}</td>
              <td class="mono">${U.esc(r.destino_uf || "—")}</td>
              <td>${tagStatus(r.status)}${tagVeiculoComprometido(r.motorista_id)}</td>
            </tr>`).join("")}
        </tbody>
      </table></div>`;
    document.querySelectorAll("#rot-proximos tr.clickable").forEach(tr => {
      tr.onclick = () => detalhe(tr.dataset.id);
    });
  }

  function renderTudo() {
    renderAlertas();
    renderHoje();
    renderCarga();
    preencherFiltroMotorista();
    renderProximos();
  }

  function preencherFiltroMotorista() {
    const sel = document.getElementById("rf-mot");
    const atual = sel.value;
    sel.innerHTML = '<option value="">todos</option>' +
      state.motoristas.map(m => `<option value="${m.id}">${U.esc(m.nome)}</option>`).join("");
    sel.value = atual;
  }

  function detalhe(id) {
    const r = state.roteiro.find(x => x.id === id);
    if (!r) return;
    U.openModal(`
      <h2>Entrega de ${U.esc(r.motoristas ? r.motoristas.nome : "—")}</h2>
      <div class="modal-sub">${U.dBRfull(r.data)} · ${diaSemana(r.data)}</div>
      <dl class="kv">
        <dt>Empresa</dt><dd>${U.esc(empresaDe(r) || "—")}</dd>
        <dt>Origem</dt><dd>${U.esc(origemTexto(r) || "—")}</dd>
        <dt>Destino</dt><dd>${U.esc(destinoTexto(r) || "—")}</dd>
        <dt>Status</dt><dd>${tagStatus(r.status)}</dd>
        ${r.observacao ? `<dt>Observação</dt><dd>${U.esc(r.observacao)}</dd>` : ""}
      </dl>
      <div class="divider"></div>
      <div class="full" style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-primary" id="rd-editar">Editar</button>
      </div>`);
    document.getElementById("rd-editar").onclick = () => { U.closeModal(); formRoteiro(r); };
  }

  function formRoteiro(existente, motoristaPreSelecionado) {
    const ed = !!existente;
    const g = (campo, def) => ed ? (existente[campo] ?? def) : def;
    U.openDrawer({
      titulo: ed ? "Editar entrega" : "Nova entrega",
      sub: ed ? "Altere os campos e salve." : "Cadastro gravado direto no banco (Supabase).",
      corpo: `
      <div class="form-grid">
        <div><label>Motorista<span class="req">*</span></label><select id="rf-form-mot">
          ${state.motoristas.map(m => `<option value="${m.id}" ${(g("motorista_id") || motoristaPreSelecionado) === m.id ? "selected" : ""}>${U.esc(m.nome)}</option>`).join("")}
        </select></div>
        <div><label>Data<span class="req">*</span></label><input type="date" id="rf-form-data" value="${g("data", HOJE)}"></div>
        <div class="full"><label>Empresa<span class="req">*</span></label><input id="rf-form-empresa" value="${U.esc(g("destino_local", "") || "")}" placeholder="ex.: TOTALPLAST"></div>
        <div><label>Origem (cidade)</label><input id="rf-form-origem-local" value="${U.esc(g("origem_local", "") || "")}" placeholder="ex.: Guarulhos"></div>
        <div><label>UF origem</label><select id="rf-form-origem-uf">
          <option value="">—</option>
          ${UFS.map(uf => `<option ${g("origem_uf") === uf ? "selected" : ""}>${uf}</option>`).join("")}
        </select></div>
        <div><label>Destino (cidade)</label><input id="rf-form-cidade" value="${U.esc(g("destino_cidade", "") || "")}" placeholder="ex.: Americana"></div>
        <div><label>UF destino</label><select id="rf-form-uf">
          <option value="">—</option>
          ${UFS.map(uf => `<option ${g("destino_uf") === uf ? "selected" : ""}>${uf}</option>`).join("")}
        </select></div>
        <div class="full"><label>Status</label><select id="rf-form-status">
          ${["a confirmar", "confirmado", "em andamento", "concluído"].map(s =>
            `<option ${(g("status", "a confirmar") || "").toLowerCase() === s ? "selected" : ""}>${s}</option>`).join("")}
        </select></div>
        <div class="full"><label>Observação</label><input id="rf-form-obs" value="${U.esc(g("observacao", "") || "")}" placeholder="opcional"></div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório</div>
      </div>`,
      rodape: `
        <button class="btn" id="rf-form-cancel">Cancelar</button>
        <button class="btn btn-primary" id="rf-form-save">${ed ? "Salvar alterações" : "Cadastrar entrega"}</button>`,
    });
    document.getElementById("rf-form-cancel").onclick = U.closeDrawer;
    document.getElementById("rf-form-save").onclick = async () => {
      const val = id => document.getElementById(id).value;
      const empresa = val("rf-form-empresa").trim();
      if (!val("rf-form-mot") || !val("rf-form-data") || !empresa) {
        U.toast("Preencha motorista, data e empresa."); return;
      }
      const payload = {
        motorista_id: val("rf-form-mot"),
        data: val("rf-form-data"),
        destino_local: empresa.toUpperCase(),
        origem_local: val("rf-form-origem-local").trim() || null,
        origem_uf: val("rf-form-origem-uf") || null,
        destino_cidade: val("rf-form-cidade").trim() || null,
        destino_uf: val("rf-form-uf") || null,
        status: val("rf-form-status"),
        observacao: val("rf-form-obs").trim() || null,
      };
      const btn = document.getElementById("rf-form-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const salvo = ed ? await LIVE.atualizarRoteiro(existente.id, payload) : await LIVE.criarRoteiro(payload);
        const i = state.roteiro.findIndex(x => x.id === salvo.id);
        if (i >= 0) state.roteiro[i] = salvo; else state.roteiro.push(salvo);
        U.closeDrawer();
        renderTudo();
        U.toast(ed ? "Entrega atualizada." : "Entrega cadastrada.");
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = ed ? "Salvar alterações" : "Cadastrar entrega";
      }
    };
  }

  async function carregar() {
    try {
      const [motoristas, roteiro, veiculos] = await Promise.all([
        LIVE.motoristas(), LIVE.roteiro(HOJE, U.addDias(HOJE, 30)), LIVE.veiculos(true),
      ]);
      state.motoristas = motoristas;
      state.roteiro = roteiro;
      state.veiculos = veiculos;
      state.erro = null;
    } catch (e) {
      state.motoristas = []; state.roteiro = []; state.veiculos = [];
      state.erro = "Não foi possível carregar o roteiro: " + (e.message || e);
    }
    document.getElementById("btn-nova-entrega").disabled = false;
    renderTudo();
  }

  function bind() {
    document.getElementById("rf-mot").addEventListener("change", e => {
      state.motoristaFiltro = e.target.value; renderProximos();
    });
    document.getElementById("btn-nova-entrega").addEventListener("click", () => formRoteiro(null));
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.roteiro = {
    title: "Roteiro diário",
    sub: "Agenda por motorista, carga de trabalho e alerta de tempo ocioso",
    render: view, bind,
  };
})();
