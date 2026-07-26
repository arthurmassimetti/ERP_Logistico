/* Contas a receber — gerado automaticamente pelos fretes (vw_contas_receber), sem digitação manual.
   Some da lista sozinho quando um frete é marcado como recebido (aqui ou em Fretes). */
(function () {
  const U = window.U;

  const state = {
    dados: [], recebidosMes: [], empresaFiltro: "", statusFiltro: "", erro: null,
  };

  function view() {
    return `
    <div class="kpi-grid" id="rec-kpis"><div class="empty">Carregando…</div></div>

    <div class="filters">
      <div class="field"><label>Transportadora</label><select id="rf-emp"><option value="">todas</option></select></div>
      <div class="field"><label>Situação</label><select id="rf-status">
        <option value="">todas</option>
        <option value="atraso">em atraso</option>
        <option value="prazo">no prazo</option>
        <option value="sem">sem previsão</option>
      </select></div>
    </div>

    <div id="rec-lista"><div class="empty">Carregando contas a receber…</div></div>
    <div class="legend-note">Cada linha nasce sozinha quando um frete é lançado com saldo pendente — não existe "criar conta a receber" manual aqui, de propósito.</div>`;
  }

  function agruparPorEmpresa(rows) {
    const map = new Map();
    rows.forEach(r => {
      const key = r.empresa || "sem transportadora";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return [...map.entries()].sort((a, b) => U.sum(b[1], x => x.valor_pendente) - U.sum(a[1], x => x.valor_pendente));
  }

  function kpis() {
    const total = U.sum(state.dados, r => r.valor_pendente);
    const atraso = state.dados.filter(r => r.pagamento_previsto && U.diasAte(r.pagamento_previsto) < 0);
    const prazo30 = state.dados.filter(r => r.pagamento_previsto && U.diasAte(r.pagamento_previsto) >= 0 && U.diasAte(r.pagamento_previsto) <= 30);
    const semPrevisao = state.dados.filter(r => !r.pagamento_previsto);
    const recebidoMesTotal = U.sum(state.recebidosMes, r => (r.saldo != null ? r.saldo : (r.valor_frete || 0) - (r.adiantamento || 0)));

    document.getElementById("rec-kpis").innerHTML = `
      <div class="kpi"><div class="kpi-label">${U.icons.receive} Total pendente</div>
        <div class="kpi-value pos">${U.money(total)}</div>
        <div class="kpi-sub">${state.dados.length} frete(s)</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.alert} Em atraso</div>
        <div class="kpi-value ${atraso.length ? "neg" : ""}">${U.money(U.sum(atraso, r => r.valor_pendente))}</div>
        <div class="kpi-sub">${atraso.length} frete(s)</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.calendar} Previsto em 30 dias</div>
        <div class="kpi-value">${U.money(U.sum(prazo30, r => r.valor_pendente))}</div>
        <div class="kpi-sub">${prazo30.length} frete(s)${semPrevisao.length ? " · " + semPrevisao.length + " sem previsão" : ""}</div></div>
      <div class="kpi"><div class="kpi-label">${U.icons.wallet} Recebido este mês</div>
        <div class="kpi-value pos">${U.money(recebidoMesTotal)}</div>
        <div class="kpi-sub">${state.recebidosMes.length} frete(s) baixado(s)</div></div>`;
  }

  function filtrados() {
    return state.dados.filter(r => {
      if (state.empresaFiltro && r.empresa !== state.empresaFiltro) return false;
      if (state.statusFiltro === "atraso" && !(r.pagamento_previsto && U.diasAte(r.pagamento_previsto) < 0)) return false;
      if (state.statusFiltro === "prazo" && !(r.pagamento_previsto && U.diasAte(r.pagamento_previsto) >= 0)) return false;
      if (state.statusFiltro === "sem" && r.pagamento_previsto) return false;
      return true;
    });
  }

  function preencherFiltros() {
    const emps = [...new Set(state.dados.map(r => r.empresa).filter(Boolean))].sort();
    const sel = document.getElementById("rf-emp"); const atual = sel.value;
    sel.innerHTML = '<option value="">todas</option>' + emps.map(e => `<option>${U.esc(e)}</option>`).join("");
    sel.value = atual;
  }

  function linhaFrete(r) {
    const d = r.pagamento_previsto ? U.diasAte(r.pagamento_previsto) : null;
    let prazo;
    if (d === null) prazo = '<span class="tag tag-neutro">sem previsão</span>';
    else if (d < 0) prazo = `<span class="tag tag-danger">${U.dBR(r.pagamento_previsto)} · ${U.prazoLabel(r.pagamento_previsto)}</span>`;
    else if (d <= 7) prazo = `<span class="tag tag-warn">${U.dBR(r.pagamento_previsto)} · ${U.prazoLabel(r.pagamento_previsto)}</span>`;
    else prazo = `<span class="tag tag-neutro">${U.dBR(r.pagamento_previsto)}</span>`;
    return `<tr>
      <td class="td-main">${U.dBR(r.data)} <span class="muted">· frete ${U.money(r.valor_frete)}</span></td>
      <td>${prazo}</td>
      <td class="num">${U.money(r.valor_pendente)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-ghost" data-parcial="${r.frete_id}">parcial</button>
        <button class="btn btn-sm" data-recebido="${r.frete_id}">recebido</button>
      </td>
    </tr>`;
  }

  function lista() {
    const rows = filtrados().sort((a, b) => (a.pagamento_previsto || "9999-99-99").localeCompare(b.pagamento_previsto || "9999-99-99"));
    if (!rows.length) {
      document.getElementById("rec-lista").innerHTML = '<div class="empty">Nenhum recebível para os filtros.</div>';
      return;
    }
    const grupos = agruparPorEmpresa(rows);
    document.getElementById("rec-lista").innerHTML = grupos.map(([empresa, xs]) => `
      <div class="section-title">${U.esc(empresa)} <span class="count-pill">${xs.length} · ${U.money(U.sum(xs, x => x.valor_pendente))}</span></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Frete</th><th>Previsão</th><th class="num">Pendente</th><th></th></tr></thead>
        <tbody>${xs.map(linhaFrete).join("")}</tbody>
      </table></div>`).join("");
    document.querySelectorAll("[data-recebido]").forEach(b => b.onclick = () => marcarRecebido(b.dataset.recebido));
    document.querySelectorAll("[data-parcial]").forEach(b => b.onclick = () => abrirParcial(b.dataset.parcial));
  }

  async function marcarRecebido(freteId) {
    const r = state.dados.find(x => x.frete_id === freteId);
    if (!r) return;
    try {
      await LIVE.registrarRecebimentoFrete(freteId, { pagamento_realizado: U.hojeISO() });
      state.dados = state.dados.filter(x => x.frete_id !== freteId);
      kpis(); preencherFiltros(); lista();
      U.toast(`Recebimento confirmado (${U.money(r.valor_pendente)}).`);
    } catch (e) {
      U.toast("Erro: " + (e.message || e));
    }
  }

  function abrirParcial(freteId) {
    const r = state.dados.find(x => x.frete_id === freteId);
    if (!r) return;
    U.openDrawer({
      titulo: "Recebimento parcial",
      sub: `${U.esc(r.empresa || "—")} · frete de ${U.dBRfull(r.data)}`,
      corpo: `
      <div class="form-grid">
        <div><label>Valor do frete</label><input value="${U.money(r.valor_frete)}" disabled></div>
        <div><label>Já recebido (adiantamento)</label><input type="number" step="0.01" min="0" id="pp-adiant" value="${r.adiantamento || 0}"></div>
        <div class="full calc-line"><span>Novo saldo pendente</span><b id="pp-saldo">${U.money(r.valor_frete - (r.adiantamento || 0))}</b></div>
      </div>`,
      rodape: `
        <button class="btn" id="pp-cancel">Cancelar</button>
        <button class="btn btn-primary" id="pp-save">Salvar</button>`,
    });
    document.getElementById("pp-adiant").oninput = e => {
      const v = parseFloat(e.target.value) || 0;
      document.getElementById("pp-saldo").textContent = U.money(r.valor_frete - v);
    };
    document.getElementById("pp-cancel").onclick = U.closeDrawer;
    document.getElementById("pp-save").onclick = async () => {
      const novoAdiant = parseFloat(document.getElementById("pp-adiant").value) || 0;
      if (novoAdiant < 0 || novoAdiant > r.valor_frete) { U.toast("O valor recebido não pode passar do valor do frete."); return; }
      const novoSaldo = r.valor_frete - novoAdiant;
      const btn = document.getElementById("pp-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const payload = { adiantamento: novoAdiant, saldo: novoSaldo };
        if (novoSaldo <= 0) payload.pagamento_realizado = U.hojeISO();
        await LIVE.registrarRecebimentoFrete(freteId, payload);
        if (novoSaldo <= 0) {
          state.dados = state.dados.filter(x => x.frete_id !== freteId);
        } else {
          r.adiantamento = novoAdiant; r.saldo = novoSaldo; r.valor_pendente = novoSaldo;
        }
        kpis(); preencherFiltros(); lista();
        U.closeDrawer();
        U.toast(novoSaldo <= 0 ? "Frete quitado." : "Recebimento parcial registrado.");
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Salvar";
      }
    };
  }

  async function carregar() {
    try {
      const [dados, recebidosMes] = await Promise.all([
        LIVE.contasReceber(), LIVE.recebidosNoMes(U.mesAtualISO()),
      ]);
      state.dados = dados; state.recebidosMes = recebidosMes; state.erro = null;
    } catch (e) {
      state.dados = []; state.recebidosMes = [];
      state.erro = "Não foi possível carregar as contas a receber: " + (e.message || e);
    }
    if (state.erro) {
      document.getElementById("rec-kpis").innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`;
      document.getElementById("rec-lista").innerHTML = "";
      return;
    }
    kpis(); preencherFiltros(); lista();
  }

  function bind() {
    document.getElementById("rf-emp").onchange = e => { state.empresaFiltro = e.target.value; lista(); };
    document.getElementById("rf-status").onchange = e => { state.statusFiltro = e.target.value; lista(); };
    carregar();
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.receber = {
    title: "Contas a receber",
    sub: "Gerado automaticamente a partir dos fretes pendentes de pagamento",
    render: view, bind,
  };
})();
