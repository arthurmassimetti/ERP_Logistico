/* Frota — veículos, km, óleo, tacógrafo, MCT/ANTT e documentos. Dados vivos (LIVE.frota). */
(function () {
  const U = window.U;

  const state = { veiculos: [], erro: null, scrollPara: null };

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
    </div>`;
  }

  function view() {
    return `
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

    carretasEl.innerHTML = `<table class="tbl" style="min-width:0">
      <thead><tr><th>Carreta</th><th>ANTT</th><th>Vinculada a</th></tr></thead>
      <tbody>
        ${carretas.length ? carretas.map(c => {
          const cav = cavalos.find(v => v.carreta_placa === c.placa);
          const antt = cav && cav.antt_empresa ? U.esc(cav.antt_empresa) + (cav.antt_numero ? " · " + U.esc(cav.antt_numero) : "") : "—";
          return `<tr><td class="td-main mono">${U.placaFmt(c.placa)}</td>
            <td>${antt}</td>
            <td>${cav ? U.placaFmt(cav.placa) : '<span class="muted">reserva</span>'}</td></tr>`;
        }).join("") : '<tr><td colspan="3" class="empty">Nenhuma carreta cadastrada.</td></tr>'}
      </tbody>
    </table>`;

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
      state.veiculos = await window.LIVE.frota();
      state.erro = null;
    } catch (e) {
      state.veiculos = [];
      state.erro = "Não foi possível carregar a frota: " + (e.message || e);
    }
    renderTudo();
  }

  function bind(params) {
    state.scrollPara = params && params.placa;
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.frota = {
    title: "Frota",
    sub: "Quilometragem, troca de óleo, tacógrafo, MCT e ANTT",
    render: view, bind,
  };
})();
