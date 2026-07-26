/* Frota — veículos, km, óleo, tacógrafo, MCT/ANTT e documentos. Dados vivos (LIVE.frota). */
(function () {
  const U = window.U;

  const state = { veiculos: [], motoristas: [], erro: null, scrollPara: null };

  function oleoInfo(v) {
    if (!v.km_atual || !v.km_troca) return { html: '<span class="muted">sem registro</span>', cls: "" };
    const resta = v.km_troca - v.km_atual;
    const janela = 15000; /* janela visual da barra */
    const pct = Math.max(0, Math.min(100, Math.round((1 - resta / janela) * 100)));
    let cls = "", tag = `<span class="tag tag-ok">faltam ${U.num(resta)} km</span>`;
    if (resta <= 0) { cls = "danger"; tag = `<span class="tag tag-danger">vencida há ${U.num(-resta)} km</span>`; }
    else if (resta < 10000) { cls = "warn"; tag = `<span class="tag tag-warn">faltam ${U.num(resta)} km</span>`; }
    return { html: tag, cls, pct: resta <= 0 ? 100 : pct };
  }

  function statusGeral(v) {
    const oleoVencido = v.km_atual && v.km_troca - v.km_atual <= 0;
    const tacoVencido = v.tacografo_venc && U.diasAte(v.tacografo_venc) <= 0;
    if (oleoVencido || tacoVencido) return '<span class="tag tag-danger">atenção</span>';
    const oleoProx = v.km_atual && v.km_troca - v.km_atual < 10000;
    const tacoProx = v.tacografo_venc && U.diasAte(v.tacografo_venc) <= 45;
    if (oleoProx || tacoProx) return '<span class="tag tag-warn">próximo</span>';
    if (!v.km_atual) return '<span class="tag tag-neutro">sem dados</span>';
    return '<span class="tag tag-ok">regular</span>';
  }

  const SITUACOES_VEICULO = [
    { v: "disponivel", r: "Disponível" }, { v: "em_manutencao", r: "Em manutenção" },
    { v: "bloqueado", r: "Bloqueado" }, { v: "inativo", r: "Inativo" },
  ];

  function formSituacao(v) {
    U.openDrawer({
      titulo: `Situação — ${U.placaFmt(v.placa)}`,
      sub: "Muda o que aparece no roteiro e nos alertas. Não mexe no cadastro do veículo.",
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Situação</label><select id="sf-situacao">
          ${SITUACOES_VEICULO.map(s => `<option value="${s.v}" ${v.situacao === s.v ? "selected" : ""}>${s.r}</option>`).join("")}
        </select></div>
        <div class="full"><label>Motivo</label><input id="sf-motivo" value="${U.esc(v.situacao_motivo || "")}" placeholder="opcional"></div>
      </div>`,
      rodape: `
        <button class="btn" id="sf-cancel">Cancelar</button>
        <button class="btn btn-primary" id="sf-save">Salvar</button>`,
    });
    document.getElementById("sf-cancel").onclick = U.closeDrawer;
    document.getElementById("sf-save").onclick = async () => {
      const situacao = document.getElementById("sf-situacao").value;
      const situacao_motivo = document.getElementById("sf-motivo").value.trim() || null;
      const btn = document.getElementById("sf-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        await LIVE.atualizarSituacaoVeiculo(v.placa, { situacao, situacao_motivo });
        U.closeDrawer();
        U.toast("Situação atualizada.");
        carregar();
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Salvar";
      }
    };
  }

  /* --------------------------------------------------- criar / editar veículo */
  function opcoesCarreta(existente, tipoSelecionado) {
    if (tipoSelecionado !== "cavalo") return "";
    const carretas = state.veiculos.filter(v => v.tipo === "carreta" && (!existente || v.placa !== existente.placa));
    const atual = existente ? existente.carreta_placa : null;
    return `
    <div><label>Carreta vinculada</label><select id="vf-carreta">
      <option value="">nenhuma</option>
      ${carretas.map(c => `<option value="${c.placa}" ${atual === c.placa ? "selected" : ""}>${U.placaFmt(c.placa)}</option>`).join("")}
    </select></div>`;
  }

  function opcoesMotorista(existente, tipoSelecionado) {
    if (tipoSelecionado !== "cavalo") return "";
    const atualId = existente ? existente.motorista_id : null;
    return `
    <div><label>Motorista vinculado</label><select id="vf-motorista">
      <option value="">sem motorista</option>
      ${state.motoristas.map(m => {
        const outro = state.veiculos.find(v => v.motorista_id === m.id && (!existente || v.placa !== existente.placa));
        const nota = outro ? ` (hoje em ${U.placaFmt(outro.placa)})` : "";
        return `<option value="${m.id}" ${atualId === m.id ? "selected" : ""}>${U.esc(m.nome)}${nota}</option>`;
      }).join("")}
    </select></div>`;
  }

  function formVeiculo(existente) {
    const ed = !!existente;
    const g = (c, d) => ed ? (existente[c] ?? d) : d;
    const tipoAtual = g("tipo", "cavalo");

    U.openDrawer({
      titulo: ed ? `Editar veículo — ${U.placaFmt(existente.placa)}` : "Novo veículo",
      sub: ed ? "Placa e tipo não podem ser alterados depois de criado." : "",
      corpo: `
      <div class="form-grid">
        <div><label>Placa<span class="req">*</span></label><input id="vf-placa" ${ed ? "disabled" : ""} value="${U.esc((g("placa", "") || "").toUpperCase())}" placeholder="ABC1D23" style="text-transform:uppercase"></div>
        <div><label>Tipo<span class="req">*</span></label><select id="vf-tipo" ${ed ? "disabled" : ""}>
          <option value="cavalo" ${tipoAtual === "cavalo" ? "selected" : ""}>Cavalo</option>
          <option value="carreta" ${tipoAtual === "carreta" ? "selected" : ""}>Carreta</option>
        </select></div>
        <div><label>Modelo</label><input id="vf-modelo" value="${U.esc(g("modelo", "") || "")}"></div>
        <div><label>Ano/modelo</label><input id="vf-ano" value="${U.esc(g("ano_modelo", "") || "")}"></div>
        <div><label>Cor</label><input id="vf-cor" value="${U.esc(g("cor", "") || "")}"></div>
        <div><label>Km atual</label><input type="number" id="vf-km-atual" min="0" value="${g("km_atual", "") ?? ""}"></div>
        <div><label>Km da próxima troca de óleo</label><input type="number" id="vf-km-troca" min="0" value="${g("km_troca", "") ?? ""}"></div>
        <div><label>Vencimento do tacógrafo</label><input type="date" id="vf-taco-venc" value="${g("tacografo_venc", "") || ""}"></div>
        <div><label>Observação do tacógrafo</label><input id="vf-taco-obs" value="${U.esc(g("tacografo_obs", "") || "")}"></div>
        <div><label>Número MCT</label><input id="vf-mct-num" value="${U.esc(g("mct_numero", "") || "")}"></div>
        <div><label>Status MCT</label><input id="vf-mct-status" value="${U.esc(g("mct_status", "") || "")}"></div>
        <div><label>Empresa ANTT</label><input id="vf-antt-empresa" value="${U.esc(g("antt_empresa", "") || "")}"></div>
        <div><label>Número ANTT</label><input id="vf-antt-numero" value="${U.esc(g("antt_numero", "") || "")}"></div>
        <div id="vf-campo-carreta">${opcoesCarreta(existente, tipoAtual)}</div>
        <div id="vf-campo-motorista">${opcoesMotorista(existente, tipoAtual)}</div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório</div>
      </div>`,
      rodape: `
        <button class="btn" id="vf-cancel">Cancelar</button>
        <button class="btn btn-primary" id="vf-save">${ed ? "Salvar alterações" : "Cadastrar veículo"}</button>`,
    });

    if (!ed) {
      document.getElementById("vf-tipo").onchange = e => {
        document.getElementById("vf-campo-carreta").innerHTML = opcoesCarreta(null, e.target.value);
        document.getElementById("vf-campo-motorista").innerHTML = opcoesMotorista(null, e.target.value);
      };
    }

    document.getElementById("vf-cancel").onclick = U.closeDrawer;
    document.getElementById("vf-save").onclick = async () => {
      const placa = document.getElementById("vf-placa").value.trim().toUpperCase();
      const tipo = document.getElementById("vf-tipo").value;
      if (!ed && !placa) { U.toast("Informe a placa."); return; }

      const numOrNull = id => { const val = document.getElementById(id).value; return val === "" ? null : parseInt(val, 10); };
      const strOrNull = id => document.getElementById(id).value.trim() || null;
      const elCarreta = document.getElementById("vf-carreta");
      const elMotorista = document.getElementById("vf-motorista");
      const motoristaEscolhido = elMotorista ? (elMotorista.value || null) : null;

      const payload = {
        modelo: strOrNull("vf-modelo"), ano_modelo: strOrNull("vf-ano"), cor: strOrNull("vf-cor"),
        km_atual: numOrNull("vf-km-atual"), km_troca: numOrNull("vf-km-troca"),
        tacografo_venc: document.getElementById("vf-taco-venc").value || null,
        tacografo_obs: strOrNull("vf-taco-obs"),
        mct_numero: strOrNull("vf-mct-num"), mct_status: strOrNull("vf-mct-status"),
        antt_empresa: strOrNull("vf-antt-empresa"), antt_numero: strOrNull("vf-antt-numero"),
        carreta_placa: elCarreta ? (elCarreta.value || null) : null,
      };
      if (tipo === "cavalo") payload.motorista_id = motoristaEscolhido;

      const btn = document.getElementById("vf-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        if (motoristaEscolhido) await LIVE.liberarVeiculosDoMotorista(motoristaEscolhido);
        if (ed) await LIVE.atualizarVeiculo(existente.placa, payload);
        else await LIVE.criarVeiculo({ placa, tipo, ...payload });
        U.closeDrawer();
        U.toast(ed ? "Veículo atualizado." : "Veículo cadastrado.");
        carregar();
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = ed ? "Salvar alterações" : "Cadastrar veículo";
      }
    };
  }

  function card(v, mf) {
    const oleo = oleoInfo(v);
    const consumoBad = v.media_kml && v.media_kml < mf * 0.95;
    return `
    <div class="fleet-card" id="veic-${v.placa}">
      <div class="fleet-head">
        <div>
          <div class="fleet-placa">${U.placaFmt(v.placa)}</div>
          <div class="fleet-sub">carreta ${v.carreta_placa ? U.placaFmt(v.carreta_placa) : "—"}${v.motoristas ? " · " + U.esc(v.motoristas.nome) : ""}</div>
        </div>
        ${statusGeral(v)}
      </div>
      <div class="fleet-rows">
        <div class="fleet-row"><span class="lbl">Situação operacional</span><span class="val">${U.tagSituacaoVeiculo(v.situacao)}</span></div>
        ${v.situacao_motivo ? `<div class="fleet-sub">${U.esc(v.situacao_motivo)}</div>` : ""}
        <div class="fleet-row"><span class="lbl">Km atual</span><span class="val">${v.km_atual ? U.num(v.km_atual) + " km" : "—"}</span></div>
        <div class="fleet-row"><span class="lbl">Próxima troca de óleo</span><span class="val">${v.km_troca ? U.num(v.km_troca) + " km" : "—"}</span></div>
        <div class="fleet-row"><span class="lbl">Situação do óleo</span><span class="val">${oleo.html}</span></div>
        ${oleo.pct !== undefined ? `<div class="prog ${oleo.cls}"><i style="width:${oleo.pct}%"></i></div>` : ""}
        <div class="fleet-row"><span class="lbl">Média de consumo</span>
          <span class="val">${v.media_kml ? U.num(v.media_kml, 3) + " km/l" : "—"}
          ${consumoBad ? '<span class="tag tag-warn">abaixo da frota</span>' : ""}</span></div>
        <div class="fleet-row"><span class="lbl">Tacógrafo</span><span class="val">${U.vencTag(v.tacografo_venc, v.tacografo_obs)}</span></div>
        <div class="fleet-row"><span class="lbl">MCT</span><span class="val">${v.mct_numero ? U.esc(v.mct_numero) + (v.mct_status ? " · " + U.esc(v.mct_status) : "") : "—"}</span></div>
        <div class="fleet-row"><span class="lbl">ANTT</span><span class="val">${v.antt_empresa ? U.esc(v.antt_empresa) : "—"}${v.antt_numero ? " · " + U.esc(v.antt_numero) : ""}</span></div>
      </div>
      <div class="fleet-foot">
        <button class="btn btn-sm" data-situacao="${v.placa}" type="button">Alterar situação</button>
        <button class="btn btn-sm" data-editar-veiculo="${v.placa}" type="button">Editar veículo</button>
        <a class="btn btn-sm btn-ghost" href="#/manutencoes?placa=${v.placa}">Manutenções →</a>
      </div>
    </div>`;
  }

  function view() {
    return `
    <div class="filters">
      <div class="spacer"></div>
      <button class="btn btn-primary" id="btn-novo-veiculo" disabled>+ Novo veículo</button>
    </div>

    <div class="kpi-grid" id="frota-kpis"><div class="empty">Carregando…</div></div>

    <div class="section-title">Veículos (cavalo + carreta)</div>
    <div class="fleet-grid" id="frota-veiculos"><div class="empty">Carregando…</div></div>

    <div class="section-title">Carretas e ANTT</div>
    <div class="table-wrap" id="frota-carretas"></div>
    <div class="legend-note">Dados ao vivo do cadastro de Frota no Supabase.</div>`;
  }

  function renderTudo() {
    const kpis = document.getElementById("frota-kpis");
    const grid = document.getElementById("frota-veiculos");
    const carretasEl = document.getElementById("frota-carretas");

    if (state.erro) {
      kpis.innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`;
      grid.innerHTML = ""; carretasEl.innerHTML = "";
      return;
    }

    const cavalos = state.veiculos.filter(v => v.tipo === "cavalo");
    const carretas = state.veiculos.filter(v => v.tipo === "carreta");
    const mf = U.mediaFrota(cavalos);

    kpis.innerHTML = `
      <div class="kpi"><div class="kpi-label">${U.icons.truck} Cavalos</div>
        <div class="kpi-value">${cavalos.length}</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.truck} Carretas</div>
        <div class="kpi-value">${carretas.length}</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.oil} Trocas de óleo vencidas</div>
        <div class="kpi-value ${cavalos.some(v => v.km_atual && v.km_troca - v.km_atual <= 0) ? "neg" : ""}">
          ${cavalos.filter(v => v.km_atual && v.km_troca - v.km_atual <= 0).length}</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.doc} Tacógrafos vencidos / hoje</div>
        <div class="kpi-value neg">${cavalos.filter(v => v.tacografo_venc && U.diasAte(v.tacografo_venc) <= 0).length}</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.gauge} Média da frota</div>
        <div class="kpi-value">${U.num(mf, 3)} km/l</div></div>`;

    grid.innerHTML = cavalos.map(v => card(v, mf)).join("") || '<div class="empty">Nenhum cavalo cadastrado.</div>';
    grid.querySelectorAll("[data-situacao]").forEach(btn => {
      btn.onclick = () => {
        const v = state.veiculos.find(x => x.placa === btn.dataset.situacao);
        if (v) formSituacao(v);
      };
    });
    grid.querySelectorAll("[data-editar-veiculo]").forEach(btn => {
      btn.onclick = () => {
        const v = state.veiculos.find(x => x.placa === btn.dataset.editarVeiculo);
        if (v) formVeiculo(v);
      };
    });

    carretasEl.innerHTML = `<table class="tbl" style="min-width:0">
      <thead><tr><th>Carreta</th><th>ANTT</th><th>Vinculada a</th><th></th></tr></thead>
      <tbody>
        ${carretas.length ? carretas.map(c => {
          const cav = cavalos.find(v => v.carreta_placa === c.placa);
          const antt = cav && cav.antt_empresa ? U.esc(cav.antt_empresa) + (cav.antt_numero ? " · " + U.esc(cav.antt_numero) : "") : "—";
          return `<tr><td class="td-main mono">${U.placaFmt(c.placa)}</td>
            <td>${antt}</td>
            <td>${cav ? U.placaFmt(cav.placa) : '<span class="muted">reserva</span>'}</td>
            <td><button class="btn btn-sm btn-ghost" data-editar-veiculo="${c.placa}" type="button">editar</button></td></tr>`;
        }).join("") : '<tr><td colspan="4" class="empty">Nenhuma carreta cadastrada.</td></tr>'}
      </tbody>
    </table>`;
    carretasEl.querySelectorAll("[data-editar-veiculo]").forEach(btn => {
      btn.onclick = () => {
        const v = state.veiculos.find(x => x.placa === btn.dataset.editarVeiculo);
        if (v) formVeiculo(v);
      };
    });

    if (state.scrollPara) {
      const el = document.getElementById("veic-" + state.scrollPara);
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.style.outline = "2px solid var(--primary)";
        setTimeout(() => el.style.outline = "", 2500);
      }
      state.scrollPara = null;
    }
  }

  async function carregar() {
    try {
      const [veiculos, motoristas] = await Promise.all([window.LIVE.frota(), window.LIVE.motoristas()]);
      state.veiculos = veiculos;
      state.motoristas = motoristas;
      state.erro = null;
    } catch (e) {
      state.veiculos = []; state.motoristas = [];
      state.erro = "Não foi possível carregar a frota: " + (e.message || e);
    }
    renderTudo();
  }

  function bind(params) {
    state.scrollPara = params && params.placa;
    document.getElementById("btn-novo-veiculo").onclick = () => formVeiculo(null);
    carregar().then(() => { document.getElementById("btn-novo-veiculo").disabled = false; });
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.frota = {
    title: "Frota",
    sub: "Quilometragem, troca de óleo, tacógrafo, MCT e ANTT",
    render: view, bind,
  };
})();
