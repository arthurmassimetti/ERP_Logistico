/* Helpers compartilhados */
(function () {
  const U = {};

  /* data local do navegador — NUNCA usar new Date().toISOString() pra "hoje": toISOString()
     devolve a data em UTC, então das 21h à meia-noite (fuso de Brasília, UTC-3) o app passaria
     a operar um dia à frente (conta vencendo hoje apareceria como vencida, baixa dada à noite
     gravaria a data de amanhã). */
  function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  U.hojeISO = hojeISO;
  U.mesAtualISO = function () {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  U.addDias = function (iso, n) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  U.esc = function (s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  };

  U.money = function (v, dash) {
    if (v === null || v === undefined || isNaN(v)) return dash === undefined ? "—" : dash;
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  U.num = function (v, dec) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return v.toLocaleString("pt-BR", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  };

  U.isISO = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);

  U.dBR = function (iso) {
    if (!U.isISO(iso)) return iso ? String(iso) : "—";
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${y.slice(2)}`;
  };
  U.dBRfull = function (iso) {
    if (!U.isISO(iso)) return iso ? String(iso) : "—";
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  };

  U.diasAte = function (iso) {
    if (!U.isISO(iso)) return null;
    const a = new Date(iso + "T00:00:00");
    const h = new Date(hojeISO() + "T00:00:00");
    return Math.round((a - h) / 86400000);
  };

  U.prazoLabel = function (iso) {
    const d = U.diasAte(iso);
    if (d === null) return "";
    if (d < -1) return `venceu há ${-d} dias`;
    if (d === -1) return "venceu ontem";
    if (d === 0) return "hoje";
    if (d === 1) return "amanhã";
    return `em ${d} dias`;
  };

  /* contas avulsas em aberto e vencidas (dias<0) — mesma regra usada no badge do topo,
     no card e na tabela; centralizada aqui pra nunca mais divergir entre telas */
  U.contasVencidas = function (avulsas) {
    return avulsas.filter(c => !c.pago_em && U.diasAte(c.vencimento) < 0);
  };

  /* saldo previsto = saldo bancário + o que entra − o que sai dentro da janela (dias, padrão 30).
     Única implementação: financeiro.js e painelfinanceiro.js chamam esta função, pra nunca
     mais mostrar dois números diferentes pra mesma pergunta "quanto vou ter daqui a X dias". */
  U.calcPrevisao = function (saldos, receber, avulsas, vencsFixas, dias) {
    dias = dias || 30;
    const saldoTotal = U.sum(saldos, s => s.saldo);
    /* gerar_vencimentos() só devolve vencimento >= hoje — soma direto de state.avulsas cobre
       o atraso real; vencsFixas entra só com a parte de contas fixas, pra não contar 2x */
    const avulsasNaJanela = avulsas.filter(c => !c.pago_em && U.diasAte(c.vencimento) <= dias);
    const fixasNaJanela = vencsFixas.filter(v => v.fixa && U.diasAte(v.data) <= dias);
    const totPagar = U.sum(avulsasNaJanela, c => c.valor) + U.sum(fixasNaJanela, v => v.valor);
    const entra = U.sum(
      receber.filter(r => r.pagamento_previsto && U.diasAte(r.pagamento_previsto) <= dias),
      r => r.valor_pendente
    );
    return { saldoTotal, totPagar, entra, previsto: saldoTotal + entra - totPagar };
  };

  /* status de vencimento em 2 linhas ("8 dias em atraso" / data pequena embaixo) —
     usado nas tabelas de conta a pagar pra reduzir esforço mental de ler "vencida · 16/07/26" */
  U.statusVenc = function (iso, pagoEmIso) {
    if (pagoEmIso) return { linha1: "paga", linha2: U.dBR(pagoEmIso), tom: "ok" };
    const d = U.diasAte(iso);
    if (d === null) return { linha1: "—", linha2: "", tom: "neutro" };
    if (d < 0) return { linha1: `${-d} dia${-d === 1 ? "" : "s"} em atraso`, linha2: U.dBR(iso), tom: "danger" };
    if (d === 0) return { linha1: "vence hoje", linha2: U.dBR(iso), tom: "danger" };
    if (d <= 7) return { linha1: `vence em ${d} dia${d === 1 ? "" : "s"}`, linha2: U.dBR(iso), tom: "warn" };
    return { linha1: U.dBR(iso), linha2: "", tom: "neutro" };
  };

  U.tagStatusVenc = function (iso, pagoEmIso) {
    const s = U.statusVenc(iso, pagoEmIso);
    const cls = { ok: "tag-ok", danger: "tag-danger", warn: "tag-warn", neutro: "tag-neutro" }[s.tom];
    return `<span class="tag ${cls}">${U.esc(s.linha1)}</span>${s.linha2 ? `<div class="td-sub">${U.esc(s.linha2)}</div>` : ""}`;
  };

  /* status de recebimento do frete (mesma regra de views/fretes.js) */
  U.fretePagtoStatus = function (f) {
    if (f.pagamento_realizado) return "pago";
    if (f.pagamento_previsto) return "programado";
    return "pendente";
  };

  U.statusTagFrete = function (f) {
    const s = U.fretePagtoStatus(f);
    if (s === "pago") return '<span class="tag tag-ok">pago</span>';
    if (s === "programado") return '<span class="tag tag-info">programado</span>';
    return '<span class="tag tag-warn">pendente</span>';
  };

  /* vencimento genérico -> tag */
  U.vencTag = function (iso, obs) {
    if (!U.isISO(iso)) return '<span class="tag tag-neutro">—</span>';
    const d = U.diasAte(iso);
    const t = U.dBR(iso) + (obs ? " · " + obs : "");
    if (d < 0) return `<span class="tag tag-danger">vencido · ${U.esc(t)}</span>`;
    if (d <= 30) return `<span class="tag tag-warn">${U.esc(t)}</span>`;
    return `<span class="tag tag-ok">${U.esc(t)}</span>`;
  };

  /* situação operacional do veículo -> tag colorida (usado em Frota e Manutenções) */
  const SITUACAO_VEICULO = {
    disponivel:    { rotulo: "disponível",    cls: "tag-ok" },
    em_manutencao: { rotulo: "em manutenção", cls: "tag-warn" },
    bloqueado:     { rotulo: "bloqueado",     cls: "tag-danger" },
    inativo:       { rotulo: "inativo",       cls: "tag-neutro" },
  };
  U.situacaoVeiculoInfo = s => SITUACAO_VEICULO[s] || { rotulo: s || "—", cls: "tag-neutro" };
  U.tagSituacaoVeiculo = function (s) {
    const info = U.situacaoVeiculoInfo(s);
    return `<span class="tag ${info.cls}">${U.esc(info.rotulo)}</span>`;
  };

  /* disponibilidade do motorista -> tag colorida (usado em Motoristas) */
  const DISPONIBILIDADE_MOTORISTA = {
    disponivel: { rotulo: "disponível", cls: "tag-ok" },
    em_viagem:  { rotulo: "em viagem",  cls: "tag-info" },
    afastado:   { rotulo: "afastado",   cls: "tag-warn" },
    inativo:    { rotulo: "inativo",    cls: "tag-neutro" },
  };
  U.disponibilidadeInfo = d => DISPONIBILIDADE_MOTORISTA[d] || { rotulo: d || "—", cls: "tag-neutro" };
  U.tagDisponibilidade = function (d) {
    const info = U.disponibilidadeInfo(d);
    return `<span class="tag ${info.cls}">${U.esc(info.rotulo)}</span>`;
  };

  U.mediaFrota = function (veiculos) {
    const ms = (veiculos || []).map(v => v.media_kml).filter(m => m);
    return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0;
  };

  U.placaFmt = p => p ? p.replace(/^([A-Z]{3})(\w+)$/, "$1 $2") : "—";

  U.sum = (arr, fn) => arr.reduce((a, x) => a + (fn(x) || 0), 0);

  /* icones (SVG outline, stroke currentColor) */
  const I = {};
  const svg = (paths, vb) => `<svg viewBox="${vb || "0 0 24 24"}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  I.home = svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>');
  I.truck = svg('<path d="M1 6h13v11H1z"/><path d="M14 10h4l4 4v3h-8z"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>');
  I.cash = svg('<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M6 6V4h12v2"/>');
  I.fleet = svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>');
  I.users = svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16.5 14.5c2.4.3 4.2 1.7 5 4"/>');
  I.chart = svg('<path d="M4 20V6M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="10" width="3" height="7"/>');
  I.alert = svg('<path d="M12 3 2.5 20h19z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>');
  I.oil = svg('<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>');
  I.doc = svg('<path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5"/>');
  I.wallet = svg('<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 12h6"/><path d="M6 6V4h12v2"/>');
  I.gauge = svg('<path d="M4 18a9 9 0 1 1 16 0"/><path d="M12 13l4-4"/><circle cx="12" cy="14" r="1.4" fill="currentColor"/>');
  I.receive = svg('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>');
  I.calendar = svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>');
  I.pin = svg('<path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>');
  I.chevron = svg('<path d="m9 6 6 6-6 6"/>');
  U.icons = I;

  U.toast = function (msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 2600);
  };

  /* modal genérico */
  U.openModal = function (html) {
    const w = document.getElementById("modal-wrap");
    const m = document.getElementById("modal");
    m.innerHTML = '<button class="modal-close" id="modal-x" aria-label="Fechar">✕</button>' + html;
    w.hidden = false;
    document.getElementById("modal-x").onclick = U.closeModal;
    document.getElementById("modal-back").onclick = U.closeModal;
  };
  U.closeModal = function () { document.getElementById("modal-wrap").hidden = true; };

  /* formulário padrão — painel fixo do lado direito, cabeçalho/rodapé fixos, corpo rolável.
     { titulo, sub, corpo, rodape } — corpo é o .form-grid; rodape são só os <button>, sem wrapper. */
  U.openDrawer = function ({ titulo, sub, corpo, rodape }) {
    const w = document.getElementById("drawer-wrap");
    const d = document.getElementById("drawer");
    d.innerHTML = `
      <div class="drawer-head">
        <div>
          <h2>${titulo}</h2>
          ${sub ? `<div class="modal-sub">${sub}</div>` : ""}
        </div>
        <button class="modal-close" id="drawer-x" aria-label="Fechar">✕</button>
      </div>
      <div class="drawer-body">${corpo}</div>
      ${rodape ? `<div class="drawer-foot">${rodape}</div>` : ""}`;
    w.hidden = false;
    document.getElementById("drawer-x").onclick = U.closeDrawer;
    document.getElementById("drawer-back").onclick = U.closeDrawer;
  };
  U.closeDrawer = function () { document.getElementById("drawer-wrap").hidden = true; };

  window.U = U;
})();
