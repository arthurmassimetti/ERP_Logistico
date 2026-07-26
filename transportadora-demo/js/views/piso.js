/* Piso mínimo ANTT — calculadora independente.
   Não lê nem grava nada no banco: tudo é digitado na hora e a tabela de
   coeficientes vem de js/antt-tabela.js. Serve para negociar frete antes
   de fechar. */
(function () {
  const U = window.U;

  const state = { tipo: "carga_geral", eixos: 5, distancia: null, negociado: null };

  function view() {
    return `
    <div class="grid-2">
      <div class="card card-pad">
        <div class="section-title" style="margin-top:0">Dados da viagem</div>

        <div class="form-grid">
          <div class="full">
            <label>Distância (km)<span class="req">*</span></label>
            <input type="number" id="pa-dist" min="1" step="1" inputmode="numeric"
                   placeholder="ex: 430" value="${state.distancia ?? ""}">
          </div>
          <div>
            <label>Tipo de carga</label>
            <select id="pa-tipo">
              ${window.ANTT.TIPOS.map(t =>
                `<option value="${t.v}" ${state.tipo === t.v ? "selected" : ""}>${t.r}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Eixos (cavalo + carreta)</label>
            <select id="pa-eixos">
              ${window.ANTT.EIXOS.map(e =>
                `<option value="${e}" ${state.eixos === e ? "selected" : ""}>${e} eixos</option>`).join("")}
            </select>
          </div>
          <div class="full">
            <label>Valor negociado (R$) <span class="muted">— opcional, para comparar</span></label>
            <input type="number" id="pa-negociado" min="0" step="0.01" inputmode="decimal"
                   placeholder="ex: 4200,00" value="${state.negociado ?? ""}">
          </div>
        </div>

        <div class="legend-note mt">
          A configuração mais comum da frota é <b>5 eixos</b> (cavalo 4x2 + carreta de 3 eixos).
          Confira os eixos do veículo que vai rodar.
        </div>
      </div>

      <div id="pa-resultado"></div>
    </div>

    <div class="legend-note mt">
      Tabela A da Resolução ANTT nº ${window.ANTT.RESOLUCAO}, de ${U.dBRfull(window.ANTT.PUBLICADA_EM)} ·
      carga lotação com composição completa (cavalo e carreta do transportador) ·
      <a href="${window.ANTT.FONTE_OFICIAL}" target="_blank" rel="noopener">conferir na calculadora oficial</a>
    </div>`;
  }

  function resultado() {
    const alvo = document.getElementById("pa-resultado");
    const { tipo, eixos, distancia, negociado } = state;

    if (!(distancia > 0)) {
      alvo.innerHTML = `<div class="card card-pad"><div class="empty">
        Informe a distância para calcular o piso.</div></div>`;
      return;
    }

    const r = window.ANTT.calcular(tipo, eixos, distancia);

    if (!r) {
      alvo.innerHTML = `<div class="card card-pad">
        <div class="section-title" style="margin-top:0">Combinação não disponível</div>
        <p style="font-size:13.5px;color:var(--text-2)">
          Os coeficientes de <b>${U.esc(window.ANTT.rotuloTipo(tipo))}</b> com <b>${eixos} eixos</b>
          ainda não foram transcritos da resolução para o sistema.
        </p>
        <p style="font-size:13.5px;color:var(--text-2)">
          Use a <a href="${window.ANTT.FONTE_OFICIAL}" target="_blank" rel="noopener">calculadora
          oficial da ANTT</a> para esta combinação — preferimos avisar a chutar um valor errado.
        </p>
      </div>`;
      return;
    }

    let comparacao = "";
    if (negociado > 0) {
      const dif = negociado - r.piso;
      const abaixo = dif < 0;
      comparacao = `
        <div class="divider" style="height:1px;background:var(--border);margin:14px 0"></div>
        <div class="fleet-row"><span class="lbl">Valor negociado</span>
          <span class="val">${U.money(negociado)}</span></div>
        <div class="calc-line mt" style="${abaixo ? "border-color:var(--danger);background:var(--danger-bg)" : "border-color:var(--ok);background:var(--ok-bg)"}">
          <span>${abaixo ? "Abaixo do piso em" : "Acima do piso em"}</span>
          <b style="color:${abaixo ? "var(--danger)" : "var(--ok)"}">${U.money(Math.abs(dif))}</b>
        </div>
        ${abaixo ? `<div class="legend-note" style="color:var(--danger)">
          Cobrar abaixo do piso sujeita a multa e à obrigação de indenizar a diferença
          (Lei 13.703/2018). Confirme se a operação não se enquadra em outra tabela.</div>` : ""}`;
    }

    alvo.innerHTML = `
      <div class="card card-pad">
        <div class="section-title" style="margin-top:0">Piso mínimo</div>
        <div class="kpi-value" style="font-size:34px;color:var(--primary)">${U.money(r.piso)}</div>
        <div class="kpi-sub">${U.num(distancia)} km · ${U.esc(window.ANTT.rotuloTipo(tipo))} · ${eixos} eixos</div>

        <div class="fleet-rows mt">
          <div class="fleet-row"><span class="lbl">Deslocamento (${U.num(distancia)} km × R$ ${U.num(r.ccd, 4)}/km)</span>
            <span class="val">${U.money(r.deslocamento)}</span></div>
          <div class="fleet-row"><span class="lbl">Carga e descarga (valor fixo)</span>
            <span class="val">${U.money(r.cc)}</span></div>
        </div>
        <div class="calc-line mt"><span>Piso mínimo legal</span><b>${U.money(r.piso)}</b></div>
        ${comparacao}
      </div>`;
  }

  function bind() {
    const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };

    document.getElementById("pa-dist").addEventListener("input", e => {
      state.distancia = num(e.target.value); resultado();
    });
    document.getElementById("pa-negociado").addEventListener("input", e => {
      state.negociado = num(e.target.value); resultado();
    });
    document.getElementById("pa-tipo").addEventListener("change", e => {
      state.tipo = e.target.value; resultado();
    });
    document.getElementById("pa-eixos").addEventListener("change", e => {
      state.eixos = parseInt(e.target.value, 10); resultado();
    });

    resultado();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.piso = {
    title: "Piso mínimo ANTT",
    sub: "Calculadora do frete mínimo legal — Lei 13.703/2018",
    render: view, bind,
  };
})();
