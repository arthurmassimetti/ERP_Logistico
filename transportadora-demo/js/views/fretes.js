/* Fretes — dados vivos do Supabase. Roteiro diário agora é tela própria (js/views/roteiro.js). */
(function () {
  const U = window.U;

  const HOJE = U.hojeISO();
  const LIMITE_LISTA = 20;

  const state = {
    mes: "", transp: "", status: "", motoristaId: "", busca: "", categoriaId: "",
    dados: null,        // fretes vindos do Supabase (null = ainda não carregou)
    motoristas: [], veiculos: [], categorias: [], erro: null,
  };

  function filtrar() {
    if (!state.dados) return [];
    return state.dados.filter(f => {
      if (state.mes && f.data.slice(0, 7) !== state.mes) return false;
      if (state.transp && f.transportadora !== state.transp) return false;
      if (state.motoristaId && f.motorista_id !== state.motoristaId) return false;
      if (state.status && U.fretePagtoStatus(f) !== state.status) return false;
      if (state.categoriaId && f.categoria_carga_id !== state.categoriaId) return false;
      if (state.busca) {
        const q = state.busca.toLowerCase();
        const alvo = `${f.origem || ""} ${f.destino || ""} ${f.transportadora || ""} ${f.ciot || ""}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }

  function view() {
    return `
    <div class="section-title">Roteiro de hoje — ${U.dBRfull(HOJE)} <span class="count-pill" id="rot-resumo-count">carregando…</span></div>
    <div id="rot-resumo"><div class="empty">Carregando roteiro…</div></div>
    <div class="mt"><a class="btn btn-sm" href="#/roteiro">ver roteiro completo, alertas e próximos dias →</a></div>

    <div class="section-title">Fretes lançados <span class="count-pill" id="frete-count">carregando…</span></div>
    <div class="filters">
      <div class="field"><label>Mês</label>
        <input type="month" id="ff-mes"></div>
      <div class="field"><label>Motorista</label>
        <select id="ff-mot"><option value="">todos</option></select></div>
      <div class="field"><label>Transportadora</label>
        <select id="ff-transp"><option value="">todas</option></select></div>
      <div class="field"><label>Pagamento</label>
        <select id="ff-status"><option value="">todos</option>
          <option value="pago">pago</option><option value="programado">programado</option><option value="pendente">pendente</option>
        </select></div>
      <div class="field"><label>Categoria da carga</label>
        <select id="ff-cat"><option value="">todas</option></select></div>
      <div class="field"><label>Buscar</label>
        <input type="search" id="ff-busca" placeholder="origem, destino, CIOT…"></div>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="btn-novo-frete" disabled>+ Novo frete</button>
    </div>
    <div id="fretes-tbl"><div class="empty">Carregando fretes do banco…</div></div>`;
  }

  function tabela() {
    const fs = filtrar();
    document.getElementById("frete-count").textContent =
      `${fs.length} viagens · ${U.money(U.sum(fs, f => f.valor_frete))}`;
    if (!fs.length) {
      document.getElementById("fretes-tbl").innerHTML =
        `<div class="empty">${state.erro ? U.esc(state.erro) : "Nenhum frete para os filtros."}</div>`;
      return;
    }
    const visiveis = fs.slice(0, LIMITE_LISTA);
    const rows = visiveis.map(f => `
      <tr class="clickable" data-id="${f.id}">
        <td class="mono">${U.dBR(f.data)}</td>
        <td><div class="td-main">${U.esc(f.origem || "—")}</div><div class="td-sub">→ ${U.esc(f.destino || "—")}
          ${f.categorias_carga ? `<span class="tag tag-neutro">${U.esc(f.categorias_carga.nome)}</span>` : ""}</div></td>
        <td>${U.esc(f.transportadora || "—")}</td>
        <td class="num">${U.money(f.valor_frete)}</td>
        <td class="num">${f.adiantamento ? U.money(f.adiantamento) : "—"}</td>
        <td class="num">${f.pedagio_valor ? U.money(f.pedagio_valor) : "—"}</td>
        <td class="num">${f.comissao ? U.money(f.comissao) : "—"}</td>
        <td class="num">${f.saldo !== null ? U.money(f.saldo) : "—"}</td>
        <td>${f.ciot ? `<span class="mono">${U.esc(f.ciot)}</span>` : '<span class="tag tag-warn">sem CIOT</span>'}</td>
        <td>${U.statusTagFrete(f)}</td>
      </tr>`).join("");
    document.getElementById("fretes-tbl").innerHTML = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr>
          <th>Data</th><th>Origem / destino</th><th>Transportadora</th>
          <th class="num">Frete</th><th class="num">Adiant.</th><th class="num">Pedágio</th>
          <th class="num">Comissão</th><th class="num">Saldo</th><th>CIOT</th><th>Pagamento</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="3">Total (${fs.length} viagens)</td>
          <td class="num">${U.money(U.sum(fs, f => f.valor_frete))}</td>
          <td class="num">${U.money(U.sum(fs, f => f.adiantamento))}</td>
          <td class="num">${U.money(U.sum(fs, f => f.pedagio_valor))}</td>
          <td class="num">${U.money(U.sum(fs, f => f.comissao))}</td>
          <td class="num">${U.money(U.sum(fs, f => f.saldo))}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table></div>
      ${fs.length > LIMITE_LISTA
        ? `<div class="legend-note">Mostrando as ${LIMITE_LISTA} viagens mais recentes de ${fs.length} — os totais acima somam todas. Refine os filtros para ver outras.</div>`
        : ""}`;
    document.querySelectorAll("#fretes-tbl tr.clickable").forEach(tr => {
      tr.onclick = () => detalhe(tr.dataset.id);
    });
  }

  function detalhe(id) {
    const f = state.dados.find(x => x.id === id);
    if (!f) return;
    U.openModal(`
      <h2>Frete ${U.dBRfull(f.data)}</h2>
      <div class="modal-sub">${U.esc(f.origem || "—")} → ${U.esc(f.destino || "—")}</div>
      <dl class="kv">
        <dt>Motorista</dt><dd>${U.esc(f.motoristas ? f.motoristas.nome : "—")} ${f.veiculos ? "· " + U.placaFmt(f.veiculos.placa) : ""}</dd>
        <dt>Transportadora</dt><dd>${U.esc(f.transportadora || "—")}</dd>
        <dt>Categoria da carga</dt><dd>${f.categorias_carga ? U.esc(f.categorias_carga.nome) : "não informada"}</dd>
        <dt>Peso / cubagem</dt><dd>${f.peso_kg ? U.num(f.peso_kg) + " kg" : "—"}${f.cubagem_m3 ? " · " + U.num(f.cubagem_m3, 2) + " m³" : ""}</dd>
        <dt>Valor do frete</dt><dd>${U.money(f.valor_frete)}</dd>
        <dt>Adiantamento</dt><dd>${f.adiantamento ? U.money(f.adiantamento) : "—"}</dd>
        <dt>Diária total</dt><dd>${f.diaria ? U.money(f.diaria) : "—"}</dd>
        <dt>Diária do motorista</dt><dd>${f.diaria_motorista ? U.money(f.diaria_motorista) : "—"}</dd>
        <dt>Diária retida (empresa)</dt><dd>${U.money((f.diaria || 0) - (f.diaria_motorista || 0))}</dd>
        <dt>Saldo</dt><dd>${f.saldo !== null ? U.money(f.saldo) : "—"}</dd>
        <dt>Comissão</dt><dd>${f.comissao ? U.money(f.comissao) : "—"}</dd>
        <dt>CIOT</dt><dd>${f.ciot ? U.esc(f.ciot) : "não informado"}</dd>
        <dt>Pedágio</dt><dd>${f.pedagio_valor ? U.money(f.pedagio_valor) : "—"} ${f.pedagio_forma ? `· ${U.esc(f.pedagio_forma)}` : ""}</dd>
        <dt>Pagamento</dt><dd>${f.pagamento_realizado ? "recebido " + U.dBRfull(f.pagamento_realizado) : (f.pagamento_previsto ? "previsto " + U.dBRfull(f.pagamento_previsto) : "")} ${f.banco ? `· ${U.esc(f.banco)}` : ""} ${U.statusTagFrete(f)}</dd>
        ${f.observacao ? `<dt>Observação</dt><dd>${U.esc(f.observacao)}</dd>` : ""}
      </dl>
      <div class="divider"></div>
      <div class="full" style="display:flex;gap:10px;justify-content:flex-end">
        ${!f.pagamento_realizado ? '<button class="btn" id="fd-recebido">Marcar como recebido</button>' : ""}
        <button class="btn btn-primary" id="fd-editar">Editar frete</button>
      </div>`);
    const btnReceb = document.getElementById("fd-recebido");
    if (btnReceb) btnReceb.onclick = async () => {
      btnReceb.disabled = true; btnReceb.textContent = "Salvando…";
      try {
        const atualizado = await LIVE.atualizarFrete(f.id, { pagamento_realizado: HOJE });
        substituirNoCache(atualizado);
        U.closeModal(); tabela();
        U.toast("Frete marcado como recebido.");
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btnReceb.disabled = false; btnReceb.textContent = "Marcar como recebido";
      }
    };
    document.getElementById("fd-editar").onclick = () => { U.closeModal(); formFrete(f); };
  }

  function substituirNoCache(atualizado) {
    const i = state.dados.findIndex(x => x.id === atualizado.id);
    if (i >= 0) state.dados[i] = atualizado; else state.dados.unshift(atualizado);
  }

  /* form único: sem "existente" = criar; com "existente" = editar (mesmos campos) */
  function formFrete(existente) {
    const ed = !!existente;
    const g = (campo, def) => ed ? (existente[campo] ?? def) : def;
    U.openDrawer({
      titulo: ed ? "Editar frete" : "Novo frete",
      sub: ed ? "Altere os campos e salve." : "Lançamento gravado direto no banco (Supabase).",
      corpo: `
      <div class="form-grid">
        <div><label>Data</label><input type="date" id="nf-data" value="${g("data", HOJE)}"></div>
        <div><label>Motorista<span class="req">*</span></label><select id="nf-mot">
          ${state.motoristas.map(m => `<option value="${m.id}" ${g("motorista_id") === m.id ? "selected" : ""}>${U.esc(m.nome)}</option>`).join("")}
        </select></div>
        <div><label>Veículo</label><select id="nf-veic">
          <option value="">—</option>
          ${state.veiculos.map(v => `<option value="${U.esc(v.placa)}" ${g("veiculo_placa") === v.placa ? "selected" : ""}>${U.placaFmt(v.placa)}</option>`).join("")}
        </select></div>
        <div class="full"><label>Origem<span class="req">*</span></label><input id="nf-origem" value="${U.esc(g("origem", ""))}" placeholder="ex.: CUMBICA - GRU/SP"></div>
        <div class="full"><label>Destino<span class="req">*</span></label><input id="nf-destino" value="${U.esc(g("destino", ""))}" placeholder="ex.: ATA - CAMPO GRANDE/RJ"></div>
        <div class="full"><label>Transportadora / agenciador</label><input id="nf-transp" list="transp-list" value="${U.esc(g("transportadora", ""))}" placeholder="ex.: ROBSON - NJG">
          <datalist id="transp-list">${[...new Set((state.dados || []).map(f => f.transportadora).filter(Boolean))].sort().map(t => `<option value="${U.esc(t)}">`).join("")}</datalist></div>
        <div><label>Categoria da carga</label><select id="nf-categoria">
          <option value="">—</option>
          ${state.categorias.map(c => `<option value="${c.id}" ${g("categoria_carga_id") === c.id ? "selected" : ""}>${U.esc(c.nome)}</option>`).join("")}
        </select></div>
        <div><label>Peso (kg)</label><input type="number" id="nf-peso" step="0.001" min="0" value="${g("peso_kg", "") ?? ""}"></div>
        <div><label>Cubagem (m³)</label><input type="number" id="nf-cubagem" step="0.01" min="0" value="${g("cubagem_m3", "") ?? ""}"></div>
        <div><label>Valor do frete (R$)<span class="req">*</span></label><input type="number" id="nf-frete" step="0.01" min="0" value="${g("valor_frete", 0)}"></div>
        <div><label>Adiantamento (R$)</label><input type="number" id="nf-adiant" step="0.01" min="0" value="${g("adiantamento", 0)}"></div>
        <div><label>Diária total recebida (R$)</label><input type="number" id="nf-diaria" step="0.01" min="0" value="${g("diaria", 0)}"></div>
        <div><label>Diária repassada ao motorista (R$)</label><input type="number" id="nf-diaria-mot" step="0.01" min="0" value="${g("diaria_motorista", 0)}"></div>
        <div><label>Comissão (R$)</label><input type="number" id="nf-comissao" step="0.01" min="0" value="${g("comissao", 500)}"></div>
        <div class="full"><label>CIOT</label><input id="nf-ciot" value="${U.esc(g("ciot", "") || "")}" placeholder="nº do CIOT"></div>

        <div><label>Pedágio (R$)</label><input type="number" id="nf-pedagio" step="0.01" min="0" value="${g("pedagio_valor", 0)}"></div>
        <div class="full"><label>Forma do pedágio</label><input id="nf-pedagio-forma" value="${U.esc(g("pedagio_forma", "") || "")}" placeholder="ex.: SEM PARAR, BOLETO"></div>

        <div><label>Banco</label><input id="nf-banco" value="${U.esc(g("banco", "") || "")}" placeholder="ex.: ITAU PH"></div>
        <div><label>Pagamento previsto</label><input type="date" id="nf-pagto" value="${g("pagamento_previsto", "") || ""}"></div>
        <div class="full"><label>Observação</label><input id="nf-obs" value="${U.esc(g("observacao", "") || "")}" placeholder="observações sobre o frete"></div>

        <div class="full calc-line"><span>Saldo a receber (frete − adiantamento)</span><b id="nf-saldo">${U.money(g("valor_frete", 0) - g("adiantamento", 0))}</b></div>
        <div class="full calc-line"><span>Diária retida pela empresa (total − repassada)</span><b id="nf-diaria-retida">${U.money(g("diaria", 0) - g("diaria_motorista", 0))}</b></div>
        <div class="full calc-line"><span>Motorista recebe nesta viagem (comissão + diária repassada)</span><b id="nf-recebe-mot">${U.money(g("comissao", 500) + g("diaria_motorista", 0))}</b></div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório</div>
      </div>`,
      rodape: `
        <button class="btn" id="nf-cancel">Cancelar</button>
        <button class="btn btn-primary" id="nf-save">${ed ? "Salvar alterações" : "Lançar frete"}</button>`,
    });

    const upd = () => {
      const fr = parseFloat(document.getElementById("nf-frete").value) || 0;
      const ad = parseFloat(document.getElementById("nf-adiant").value) || 0;
      const diaria = parseFloat(document.getElementById("nf-diaria").value) || 0;
      const diariaMot = parseFloat(document.getElementById("nf-diaria-mot").value) || 0;
      const comissao = parseFloat(document.getElementById("nf-comissao").value) || 0;
      document.getElementById("nf-saldo").textContent = U.money(fr - ad);
      document.getElementById("nf-diaria-retida").textContent = U.money(diaria - diariaMot);
      document.getElementById("nf-recebe-mot").textContent = U.money(comissao + diariaMot);
    };
    ["nf-frete", "nf-adiant", "nf-diaria", "nf-diaria-mot", "nf-comissao"].forEach(id => document.getElementById(id).oninput = upd);

    /* motorista selecionado sugere o veículo dele (na abertura e ao trocar) */
    const sugerirVeiculo = (motoristaId) => {
      if (ed) return; // editando um frete existente, não sobrescreve o veículo já salvo
      const v = state.veiculos.find(x => x.motorista_id === motoristaId);
      if (v) document.getElementById("nf-veic").value = v.placa;
    };
    document.getElementById("nf-mot").onchange = (e) => sugerirVeiculo(e.target.value);
    if (!ed) sugerirVeiculo(document.getElementById("nf-mot").value);

    document.getElementById("nf-cancel").onclick = U.closeDrawer;
    document.getElementById("nf-save").onclick = async () => {
      const val = id => document.getElementById(id).value;
      const origem = val("nf-origem").trim();
      const destino = val("nf-destino").trim();
      const frete = parseFloat(val("nf-frete")) || 0;
      const motoristaId = val("nf-mot");
      if (!motoristaId || !origem || !destino || frete <= 0) {
        U.toast("Preencha motorista, origem, destino e valor do frete."); return;
      }
      const adiant = parseFloat(val("nf-adiant")) || 0;
      const diaria = parseFloat(val("nf-diaria")) || 0;
      const diariaMot = parseFloat(val("nf-diaria-mot")) || 0;
      if (diariaMot > diaria) {
        U.toast("A diária repassada ao motorista não pode ser maior que a diária total."); return;
      }
      const payload = {
        data: val("nf-data"),
        motorista_id: motoristaId,
        veiculo_placa: val("nf-veic") || null,
        origem: origem.toUpperCase(),
        destino: destino.toUpperCase(),
        transportadora: val("nf-transp").trim().toUpperCase() || null,
        categoria_carga_id: val("nf-categoria") || null,
        peso_kg: val("nf-peso") ? parseFloat(val("nf-peso")) : null,
        cubagem_m3: val("nf-cubagem") ? parseFloat(val("nf-cubagem")) : null,
        valor_frete: frete,
        adiantamento: adiant,
        diaria: diaria,
        diaria_motorista: diariaMot,
        saldo: frete - adiant,
        comissao: parseFloat(val("nf-comissao")) || 0,
        ciot: val("nf-ciot").trim() || null,
        pedagio_valor: parseFloat(val("nf-pedagio")) || 0,
        pedagio_forma: val("nf-pedagio-forma").trim() || null,
        banco: val("nf-banco").trim() || null,
        pagamento_previsto: val("nf-pagto") || null,
        observacao: val("nf-obs").trim() || null,
      };
      const btn = document.getElementById("nf-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const salvo = ed ? await LIVE.atualizarFrete(existente.id, payload) : await LIVE.criarFrete(payload);
        substituirNoCache(salvo);
        U.closeDrawer();
        preencherFiltros();
        tabela();
        U.toast(ed ? "Frete atualizado." : "Frete lançado no banco.");
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = ed ? "Salvar alterações" : "Lançar frete";
      }
    };
  }

  function preencherFiltros() {
    const selMot = document.getElementById("ff-mot");
    const atualMot = selMot.value;
    selMot.innerHTML = '<option value="">todos</option>' +
      state.motoristas.map(m => `<option value="${m.id}">${U.esc(m.nome)}</option>`).join("");
    selMot.value = atualMot;

    const transps = [...new Set((state.dados || []).map(f => f.transportadora).filter(Boolean))].sort();
    const selTransp = document.getElementById("ff-transp");
    const atualTransp = selTransp.value;
    selTransp.innerHTML = '<option value="">todas</option>' +
      transps.map(t => `<option>${U.esc(t)}</option>`).join("");
    selTransp.value = atualTransp;

    const selCat = document.getElementById("ff-cat");
    const atualCat = selCat.value;
    selCat.innerHTML = '<option value="">todas</option>' +
      state.categorias.map(c => `<option value="${c.id}">${U.esc(c.nome)}</option>`).join("");
    selCat.value = atualCat;
  }

  async function carregarRoteiroHoje() {
    try {
      const [motoristas, roteiroHoje] = await Promise.all([
        LIVE.motoristas(), LIVE.roteiro(HOJE, HOJE),
      ]);
      const porMotorista = new Map(roteiroHoje.map(r => [r.motorista_id, r]));
      const ocupados = motoristas.filter(m => porMotorista.has(m.id)).length;
      document.getElementById("rot-resumo-count").textContent =
        `${ocupados} ocupado(s) · ${motoristas.length - ocupados} disponível(is)`;
      document.getElementById("rot-resumo").innerHTML = `<div class="rot-grid">
        ${motoristas.map(m => {
          const r = porMotorista.get(m.id);
          return `<div class="rot-card">
            <div class="rot-nome">${U.esc(m.nome)}</div>
            <div class="rot-rota">${r ? U.esc(r.destino_local || "entrega sem destino informado") : '<span class="muted">sem entrega hoje</span>'}</div>
            <div class="rot-foot">
              <span class="rot-uf">${r && r.destino_uf ? U.esc(r.destino_uf) : ""}</span>
              ${r ? '<span class="tag tag-warn">ocupado</span>' : '<span class="tag tag-ok">disponível</span>'}
            </div>
          </div>`;
        }).join("")}
      </div>`;
    } catch (e) {
      document.getElementById("rot-resumo-count").textContent = "";
      document.getElementById("rot-resumo").innerHTML =
        `<div class="empty">Não foi possível carregar o roteiro de hoje.</div>`;
    }
  }

  async function carregar() {
    try {
      const [motoristas, veiculos, categorias, fretes] = await Promise.all([
        LIVE.motoristas(), LIVE.veiculos(), LIVE.categoriasCarga(), LIVE.fretes(),
      ]);
      state.motoristas = motoristas;
      state.veiculos = veiculos;
      state.categorias = categorias;
      state.dados = fretes;
      state.erro = null;
    } catch (e) {
      state.dados = [];
      state.erro = "Não foi possível carregar os fretes: " + (e.message || e);
    }
    preencherFiltros();
    document.getElementById("btn-novo-frete").disabled = false;
    tabela();
  }

  function bind() {
    const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
    on("ff-mes", "change", e => { state.mes = e.target.value; tabela(); });
    on("ff-mot", "change", e => { state.motoristaId = e.target.value; tabela(); });
    on("ff-transp", "change", e => { state.transp = e.target.value; tabela(); });
    on("ff-status", "change", e => { state.status = e.target.value; tabela(); });
    on("ff-cat", "change", e => { state.categoriaId = e.target.value; tabela(); });
    on("ff-busca", "input", e => { state.busca = e.target.value; tabela(); });
    on("btn-novo-frete", "click", () => formFrete(null));
    carregarRoteiroHoje();
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.fretes = {
    title: "Fretes",
    sub: "Viagens lançadas, com valores e pagamento",
    render: view, bind,
  };
})();
