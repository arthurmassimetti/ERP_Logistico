/* Portal do motorista — 3 abas (Início / Viagens / Relatar problema). O checklist do
   caminhão não é mais aba própria: mora dentro de "Viagens", atrás do botão "Iniciar
   viagem" (patch_017 — checklist sempre amarrado a um frete, nunca solto).
   Só dados vivos do Supabase; RLS garante que só vem o que é do próprio motorista.
   Sem drawer/modal (não existem nesta página) — formulários ficam direto na tela. */
(function () {
  const U = window.U;
  const sb = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.publishableKey);
  window.sb = sb;

  const HOJE = U.hojeISO();

  const TABS = [
    { id: "inicio", rotulo: "Início", icone: "home" },
    { id: "viagens", rotulo: "Viagens", icone: "pin" },
    { id: "problema", rotulo: "Relatar", icone: "alert" },
  ];

  const ITENS_CHECKLIST = [
    { chave: "pneus", rotulo: "Pneus" },
    { chave: "luzes", rotulo: "Luzes" },
    { chave: "freios", rotulo: "Freios" },
    { chave: "oleo", rotulo: "Óleo" },
    { chave: "agua", rotulo: "Água" },
    { chave: "estado_geral", rotulo: "Estado geral" },
  ];

  const TIPOS_PROBLEMA = [
    { v: "pneu", r: "Pneu" }, { v: "freio", r: "Freio" }, { v: "luz", r: "Luz" },
    { v: "motor", r: "Motor" }, { v: "eletrica", r: "Elétrica" }, { v: "outro", r: "Outro" },
  ];
  const URGENCIAS = [{ v: "baixa", r: "Baixa" }, { v: "media", r: "Média" }, { v: "alta", r: "Alta" }];

  const CNH_CATEGORIAS = ["A", "B", "AB", "C", "D", "E", "AC", "AD", "AE"];

  const TOUR_PASSOS = [
    { aba: "inicio", titulo: "Início", texto: "Aqui você vê alertas importantes, a tarefa de hoje e o resumo do seu acerto do mês." },
    { aba: "viagens", titulo: "Viagens", texto: "Antes de sair, toque em \"Iniciar viagem\" e responda o checklist do caminhão — pneus, freios, óleo e mais. Ao voltar, finalize a entrega com o km final." },
    { aba: "problema", titulo: "Relatar", texto: "Percebeu algo errado no veículo fora de uma viagem? Relate aqui pra equipe de frota avaliar." },
  ];

  const state = {
    aba: "inicio",
    perfil: null, motorista: null, veiculo: null,
    roteiroHoje: [], roteiroProximo: [], fretes: [], vales: [],
    viagemAtual: null, viagemPasso: "resumo", viagemChecklistRespostas: {},
    problemaTipo: "outro", problemaUrgencia: "media",
  };

  function tagStatusRoteiro(status) {
    const s = (status || "").toLowerCase();
    if (s === "confirmado") return '<span class="tag tag-ok">confirmado</span>';
    if (s === "em andamento") return '<span class="tag tag-info">em andamento</span>';
    if (s === "concluído" || s === "concluido") return '<span class="tag tag-neutro">concluído</span>';
    if (s === "a confirmar") return '<span class="tag tag-warn">a confirmar</span>';
    return `<span class="tag tag-neutro">${U.esc(status || "—")}</span>`;
  }
  function tagUrgencia(u) {
    const cls = { alta: "tag-danger", media: "tag-warn", baixa: "tag-neutro" }[u] || "tag-neutro";
    return `<span class="tag ${cls}">${U.esc((URGENCIAS.find(x => x.v === u) || {}).r || u || "—")}</span>`;
  }
  function tagStatusOcorrencia(s) {
    const map = { aberta: ["tag-warn", "aberta"], em_analise: ["tag-info", "em análise"], resolvida: ["tag-ok", "resolvida"], descartada: ["tag-neutro", "descartada"] };
    const [cls, r] = map[s] || ["tag-neutro", s];
    return `<span class="tag ${cls}">${U.esc(r)}</span>`;
  }
  function localCompleto(r) {
    return [r.destino_local, r.destino_cidade, r.destino_uf].filter(Boolean).join(" · ") || "sem destino informado";
  }
  /* mesma ideia de localCompleto, mas pra linha de FRETE (origem/destino texto livre),
     não de roteiro (destino_local/cidade/uf) — são campos diferentes */
  function rotaFrete(f) {
    return `${f.origem || "—"} → ${f.destino || "—"}`;
  }

  /* ================================================================ barra de abas */
  function montarTabBar() {
    const nav = document.getElementById("mot-tabbar");
    nav.innerHTML = TABS.map(t => `
      <button class="mot-tab-btn ${t.id === state.aba ? "active" : ""}" data-aba="${t.id}" type="button">
        ${U.icons[t.icone]}<span>${t.rotulo}</span>
      </button>`).join("");
    nav.querySelectorAll("[data-aba]").forEach(btn => { btn.onclick = () => mostrarAba(btn.dataset.aba); });
  }

  function mostrarAba(id) {
    state.aba = id;
    document.querySelectorAll(".mot-aba").forEach(el => { el.hidden = el.id !== "aba-" + id; });
    document.querySelectorAll(".mot-tab-btn").forEach(b => b.classList.toggle("active", b.dataset.aba === id));
    window.scrollTo(0, 0);
  }

  /* ================================================================ aba Início */
  function alertasProprios() {
    const alertas = [];
    if (state.motorista && state.motorista.cnh_validade) {
      const d = U.diasAte(state.motorista.cnh_validade);
      if (d !== null && d <= 30) {
        alertas.push(d < 0
          ? `Sua CNH venceu em ${U.dBR(state.motorista.cnh_validade)}. Regularize o quanto antes.`
          : `Sua CNH vence em ${U.dBR(state.motorista.cnh_validade)} (${d} dia${d === 1 ? "" : "s"}).`);
      }
    }
    if (state.veiculo && state.veiculo.situacao && state.veiculo.situacao !== "disponivel") {
      const info = U.situacaoVeiculoInfo(state.veiculo.situacao);
      alertas.push(`Seu veículo (${U.placaFmt(state.veiculo.placa)}) está ${info.rotulo}${state.veiculo.situacao_motivo ? ": " + state.veiculo.situacao_motivo : "."}`);
    }
    if (state.veiculo && state.motorista && U.categoriaAtendeVeiculo(state.motorista.cnh_categoria, state.veiculo.tipo) === false) {
      alertas.push(`Sua CNH (categoria ${U.esc(state.motorista.cnh_categoria)}) não cobre ${state.veiculo.tipo === "carreta" ? "carreta" : "cavalo mecânico"} — fale com o administrador.`);
    }
    const valesAbertos = (state.vales || []).filter(v => v.saldo > 0);
    if (valesAbertos.length) alertas.push(`Você tem ${valesAbertos.length} vale(s) com saldo a descontar.`);
    if (!state.veiculo) alertas.push("Você ainda não tem um veículo vinculado. Fale com o administrador.");
    if (state.viagemAtual && state.viagemAtual.status_entrega === "aguardando_coleta") {
      alertas.push(`Você tem uma viagem pra iniciar (${U.esc(rotaFrete(state.viagemAtual))}) — vá na aba Viagens.`);
    }
    return alertas;
  }

  function renderInicio() {
    const alvo = document.getElementById("aba-inicio");
    const tarefaHoje = state.roteiroHoje[0];
    const proxima = state.roteiroProximo[0];
    const alertas = alertasProprios();

    const mesAtual = HOJE.slice(0, 7);
    const fretesMes = state.fretes.filter(f => f.data && f.data.slice(0, 7) === mesAtual);
    const valesMes = state.vales.filter(v => v.data && v.data.slice(0, 7) === mesAtual);
    const comissaoMes = U.sum(fretesMes, f => f.comissao);
    const diariaMes = U.sum(fretesMes, f => f.diaria);
    const ganhoMes = comissaoMes + diariaMes;
    const valeMes = U.sum(valesMes, v => v.valor);

    alvo.innerHTML = `
      <section>
        <div class="mot-card">
          <div class="mot-linha1">${U.esc(state.perfil.nome)}</div>
          <div class="mot-linha3">
            ${U.tagDisponibilidade(state.motorista ? state.motorista.disponibilidade : null)}
            ${state.veiculo ? `<span class="tag tag-neutro">${U.placaFmt(state.veiculo.placa)}${state.veiculo.modelo ? " · " + U.esc(state.veiculo.modelo) : ""}</span> ${U.tagSituacaoVeiculo(state.veiculo.situacao)}` : ""}
          </div>
        </div>
      </section>

      ${alertas.length ? `
      <section>
        <div class="mot-secao-titulo">Alertas</div>
        <div class="mt">${alertas.map(a => `<div class="mot-card"><div class="mot-linha2">${U.esc(a)}</div></div>`).join("")}</div>
      </section>` : ""}

      <section>
        <div class="mot-secao-titulo">Hoje</div>
        <div class="mt">
          ${tarefaHoje ? `
          <div class="mot-card">
            <div class="mot-linha1">${U.esc(localCompleto(tarefaHoje))}</div>
            <div class="mot-linha3">${tagStatusRoteiro(tarefaHoje.status)}</div>
            ${tarefaHoje.observacao ? `<div class="mot-linha2">${U.esc(tarefaHoje.observacao)}</div>` : ""}
          </div>` : `<div class="mot-card"><div class="mot-linha1">Sem tarefa hoje</div><div class="mot-linha2">Você está disponível.</div></div>`}
        </div>
      </section>

      <section>
        <div class="mot-secao-titulo">Próxima tarefa</div>
        <div class="mt">
          ${proxima ? `
          <div class="mot-card">
            <div class="mot-linha1">${U.dBRfull(proxima.data)}</div>
            <div class="mot-linha2">${U.esc(localCompleto(proxima))}</div>
            <div class="mot-linha3">${tagStatusRoteiro(proxima.status)}</div>
          </div>` : `<div class="empty">Nenhuma tarefa programada.</div>`}
        </div>
      </section>

      <section>
        <div class="mot-secao-titulo">Meu acerto do mês</div>
        <div class="mot-kpis mt">
          <div class="mot-kpi"><b>${fretesMes.length}</b><span>viagens no mês</span></div>
          <div class="mot-kpi"><b>${U.money(comissaoMes)}</b><span>comissões</span></div>
          <div class="mot-kpi"><b>${U.money(diariaMes)}</b><span>diárias</span></div>
          <div class="mot-kpi"><b>${U.money(ganhoMes)}</b><span>ganho no mês</span></div>
          <div class="mot-kpi"><b class="neg-v">− ${U.money(valeMes)}</b><span>vale descontado</span></div>
          <div class="mot-kpi"><b class="pos-v">${U.money(ganhoMes - valeMes)}</b><span>a receber no fim do mês</span></div>
        </div>
      </section>`;
  }

  /* ================================================================ aba Viagens */
  /* "viagem" = o frete (status_entrega). Iniciar viagem grava o checklist do caminhão
     amarrado ao frete e abre a etapa; nenhum item de checklist bloqueia a saída — só
     abre ocorrência pra manutenção quando marcado "problema" (decisão do dono). */
  function chkItemFormHtml() {
    return ITENS_CHECKLIST.map(it => `
      <div class="chk-item">
        <div class="chk-item-nome">${it.rotulo}</div>
        <div class="chk-opcoes">
          <button type="button" class="chk-opt ok" data-item="${it.chave}" data-valor="ok">${U.icons.check} OK</button>
          <button type="button" class="chk-opt problema" data-item="${it.chave}" data-valor="problema">${U.icons.alert} Problema</button>
        </div>
      </div>`).join("");
  }

  function blocoViagemAtual() {
    const v = state.viagemAtual;
    if (!v) {
      if (!state.veiculo) {
        return `<div class="mot-aviso">Você ainda não tem um veículo vinculado. Fale com o administrador antes de iniciar uma viagem.</div>`;
      }
      return `<div class="mot-card"><div class="mot-linha1">Nenhuma viagem pendente</div><div class="mot-linha2">Quando uma carga for lançada pro seu nome, ela aparece aqui pra você iniciar.</div></div>`;
    }
    /* o veículo da viagem é o do FRETE (definido pelo escritório); o vinculado ao motorista
       é só o fallback — quando o frete não tem um, é esse que a rpc usa */
    const placa = v.veiculo_placa || (state.veiculo && state.veiculo.placa);
    if (!placa) {
      return `<div class="mot-aviso">Esta viagem não tem veículo definido e você não tem um vinculado. Fale com o administrador.</div>`;
    }
    if (v.status_entrega === "em_transito") {
      return `
        <div class="mot-card">
          <div class="mot-linha1">${U.esc(rotaFrete(v))}</div>
          <div class="mot-linha2">${U.dBRfull(v.data)} · ${U.placaFmt(placa)}${v.km_inicial != null ? " · saiu com " + U.num(v.km_inicial) + " km" : ""}</div>
          <div class="mot-linha3"><span class="tag tag-info">em trânsito</span></div>
        </div>
        <div class="mot-form-field mt">
          <label>Km final</label>
          <input type="number" id="viagem-km-final" inputmode="numeric" placeholder="ex.: 128950">
        </div>
        <button class="mot-btn-grande" id="viagem-finalizar-btn">Finalizar entrega</button>`;
    }
    if (state.viagemPasso !== "checklist") {
      return `
        <div class="mot-card">
          <div class="mot-linha1">${U.esc(rotaFrete(v))}</div>
          <div class="mot-linha2">${U.dBRfull(v.data)} · ${U.placaFmt(placa)}</div>
          <div class="mot-linha3"><span class="tag tag-warn">aguardando coleta</span></div>
        </div>
        <div class="legend-note mt">Iniciar a viagem abre o checklist obrigatório do caminhão.</div>
        <button class="mot-btn-grande" id="viagem-iniciar-btn">Iniciar viagem</button>`;
    }
    return `
      <div class="mot-card">
        <div class="mot-linha1">${U.esc(rotaFrete(v))}</div>
        <div class="mot-linha2">${U.dBRfull(v.data)} · ${U.placaFmt(placa)}</div>
      </div>
      <div class="mot-secao-titulo mt">Checklist do caminhão</div>
      <div class="mt">${chkItemFormHtml()}</div>
      <div class="mot-form-field mt">
        <label>Km inicial</label>
        <input type="number" id="viagem-km-inicial" inputmode="numeric" placeholder="ex.: 128400">
      </div>
      <div class="mot-form-field">
        <label>Observação (opcional)</label>
        <textarea id="viagem-obs" placeholder="algo a mais que você notou"></textarea>
      </div>
      <div class="legend-note">Item marcado "Problema" não te impede de sair — só avisa a manutenção.</div>
      <button class="mot-btn-grande" id="viagem-confirmar-btn">Confirmar e iniciar viagem</button>`;
  }

  function bindViagemAtual() {
    const v = state.viagemAtual;
    const alvo = document.getElementById("aba-viagens");

    const btnIniciar = document.getElementById("viagem-iniciar-btn");
    if (btnIniciar) btnIniciar.onclick = () => { state.viagemPasso = "checklist"; renderViagens(); };

    alvo.querySelectorAll(".chk-opt").forEach(btn => {
      btn.onclick = () => {
        const item = btn.dataset.item, valor = btn.dataset.valor;
        state.viagemChecklistRespostas[item] = valor;
        alvo.querySelectorAll(`.chk-opt[data-item="${item}"]`).forEach(b => b.classList.toggle("selecionado", b.dataset.valor === valor));
      };
    });

    const btnConfirmar = document.getElementById("viagem-confirmar-btn");
    if (btnConfirmar) btnConfirmar.onclick = () => confirmarIniciarViagem(v);

    const btnFinalizar = document.getElementById("viagem-finalizar-btn");
    if (btnFinalizar) btnFinalizar.onclick = () => confirmarFinalizarViagem(v);
  }

  async function confirmarIniciarViagem(v) {
    const faltando = ITENS_CHECKLIST.filter(it => !state.viagemChecklistRespostas[it.chave]);
    if (faltando.length) { U.toast("Responda todos os itens: " + faltando.map(f => f.rotulo).join(", ")); return; }
    const btn = document.getElementById("viagem-confirmar-btn");
    btn.disabled = true; btn.textContent = "Enviando…";
    const kmInicialStr = document.getElementById("viagem-km-inicial").value;
    const itensProblema = Object.values(state.viagemChecklistRespostas).filter(v2 => v2 === "problema").length;
    try {
      const atualizado = await LIVE.iniciarViagem(
        v.id,
        kmInicialStr ? parseFloat(kmInicialStr) : null,
        state.viagemChecklistRespostas,
        document.getElementById("viagem-obs").value.trim() || null
      );
      state.viagemAtual = atualizado;
      state.viagemPasso = "resumo";
      state.viagemChecklistRespostas = {};
      U.toast(itensProblema ? `Viagem iniciada. ${itensProblema} item(ns) reportado(s) pra manutenção.` : "Viagem iniciada.");
      renderViagens();
      renderInicio();
    } catch (e) {
      U.toast("Erro ao iniciar viagem: " + (e.message || e));
      btn.disabled = false; btn.textContent = "Confirmar e iniciar viagem";
    }
  }

  async function confirmarFinalizarViagem(v) {
    const kmFinalStr = document.getElementById("viagem-km-final").value;
    const btn = document.getElementById("viagem-finalizar-btn");
    btn.disabled = true; btn.textContent = "Finalizando…";
    try {
      await LIVE.finalizarViagem(v.id, kmFinalStr ? parseFloat(kmFinalStr) : null);
      U.toast("Entrega finalizada.");
      await atualizarViagemEHistorico();
      renderViagens();
      renderInicio();
    } catch (e) {
      U.toast("Erro ao finalizar: " + (e.message || e));
      btn.disabled = false; btn.textContent = "Finalizar entrega";
    }
  }

  /* refaz a busca da viagem atual + histórico depois de iniciar/finalizar — mais simples e
     confiável do que tentar remontar o estado local a partir do retorno da rpc */
  async function atualizarViagemEHistorico() {
    const [viagemAtual, fretes] = await Promise.all([LIVE.minhaViagemAtual(), LIVE.meusFretes(30)]);
    state.viagemAtual = viagemAtual;
    state.viagemPasso = "resumo";
    state.fretes = fretes;
  }

  function renderViagens() {
    const alvo = document.getElementById("aba-viagens");
    const tarefaHoje = state.roteiroHoje[0];

    alvo.innerHTML = `
      <section>
        <div class="mot-secao-titulo">Viagem atual</div>
        <div class="mt">${blocoViagemAtual()}</div>
      </section>

      <section>
        <div class="mot-secao-titulo">Tarefa de hoje (agenda)</div>
        <div class="mt">
          ${tarefaHoje ? `
          <div class="mot-card">
            <div class="mot-linha1">${U.esc(localCompleto(tarefaHoje))}</div>
            <div class="mot-linha2">${U.dBRfull(tarefaHoje.data)}${state.veiculo ? " · " + U.placaFmt(state.veiculo.placa) : ""}</div>
            <div class="mot-linha3">${tagStatusRoteiro(tarefaHoje.status)}</div>
          </div>` : `<div class="empty">Nenhuma tarefa hoje.</div>`}
        </div>
      </section>

      <section>
        <div class="mot-secao-titulo">Próximas tarefas</div>
        <div class="mt">
          ${state.roteiroProximo.length ? state.roteiroProximo.map(r => `
            <div class="mot-card">
              <div class="mot-linha1">${U.dBRfull(r.data)}</div>
              <div class="mot-linha2">${U.esc(localCompleto(r))}</div>
              <div class="mot-linha3">${tagStatusRoteiro(r.status)}</div>
            </div>`).join("") : `<div class="empty">Nenhuma tarefa programada nos próximos dias.</div>`}
        </div>
      </section>

      <section>
        <div class="mot-secao-titulo">Histórico de viagens realizadas</div>
        <div class="mt">
          ${(() => {
            /* só entregues: a viagem em andamento já aparece no card lá em cima, e uma
               ainda não iniciada não é "realizada" */
            const realizadas = state.fretes.filter(f => !f.status_entrega || f.status_entrega === "entregue");
            return realizadas.length ? realizadas.slice(0, 20).map(f => `
            <div class="mot-card">
              <div class="mot-linha1">${U.esc(rotaFrete(f))}</div>
              <div class="mot-linha2">${U.dBRfull(f.data)} · ${U.esc(f.transportadora || "—")}</div>
              <div class="mot-linha3"><span class="tag tag-ok">comissão ${U.money(f.comissao)}</span>${f.diaria ? `<span class="tag tag-info">diária ${U.money(f.diaria)}</span>` : ""}</div>
            </div>`).join("") : `<div class="empty">Nenhuma viagem no histórico ainda.</div>`;
          })()}
        </div>
      </section>`;

    bindViagemAtual();
  }

  /* ================================================================ aba Relatar problema */
  function renderProblema() {
    const alvo = document.getElementById("aba-problema");

    if (!state.veiculo) {
      alvo.innerHTML = `
        <div class="mot-secao-titulo">Relatar problema</div>
        <div class="mot-aviso mt">Você ainda não tem um veículo vinculado. Fale com o administrador antes de relatar um problema.</div>`;
      return;
    }

    const viagemAtual = state.roteiroHoje[0];
    alvo.innerHTML = `
      <div class="mot-secao-titulo">Relatar problema — ${U.placaFmt(state.veiculo.placa)}</div>
      <div class="mt">
        ${viagemAtual ? `<div class="legend-note">Viagem de hoje: ${U.esc(localCompleto(viagemAtual))}</div>` : ""}
        <div class="mot-form-field mt">
          <label>Tipo do problema</label>
          <select id="pb-tipo">
            ${TIPOS_PROBLEMA.map(t => `<option value="${t.v}" ${state.problemaTipo === t.v ? "selected" : ""}>${t.r}</option>`).join("")}
          </select>
        </div>
        <div class="mot-form-field">
          <label>Descrição</label>
          <textarea id="pb-desc" placeholder="descreva o que percebeu"></textarea>
        </div>
        <div class="mot-form-field">
          <label>Urgência</label>
          <div class="mot-opcoes-3" id="pb-urgencia">
            ${URGENCIAS.map(u => `<button type="button" class="mot-opt ${u.v} ${state.problemaUrgencia === u.v ? "selecionado" : ""}" data-urg="${u.v}">${u.r}</button>`).join("")}
          </div>
        </div>
        <button class="mot-btn-grande" id="pb-enviar">Enviar relato</button>
      </div>
      <div class="mt" id="pb-historico"></div>`;

    document.getElementById("pb-tipo").onchange = e => { state.problemaTipo = e.target.value; };
    alvo.querySelectorAll("#pb-urgencia .mot-opt").forEach(btn => {
      btn.onclick = () => {
        state.problemaUrgencia = btn.dataset.urg;
        alvo.querySelectorAll("#pb-urgencia .mot-opt").forEach(b => b.classList.toggle("selecionado", b.dataset.urg === state.problemaUrgencia));
      };
    });
    document.getElementById("pb-enviar").onclick = enviarOcorrencia;

    renderMeusRelatos();
  }

  async function renderMeusRelatos() {
    const alvo = document.getElementById("pb-historico");
    if (!alvo) return;
    try {
      const lista = await LIVE.minhasOcorrencias();
      alvo.innerHTML = !lista.length ? "" : `
        <div class="mot-secao-titulo">Meus relatos recentes</div>
        <div class="mt">
          ${lista.slice(0, 10).map(o => `
            <div class="mot-card">
              <div class="mot-linha1">${U.esc((TIPOS_PROBLEMA.find(t => t.v === o.tipo) || {}).r || o.tipo)}</div>
              <div class="mot-linha2">${U.esc(o.descricao || "—")}</div>
              <div class="mot-linha3">${tagUrgencia(o.urgencia)} ${tagStatusOcorrencia(o.status)} <span>${U.dBRfull(o.criado_em)}</span></div>
            </div>`).join("")}
        </div>`;
    } catch (e) { /* histórico não é crítico */ }
  }

  async function enviarOcorrencia() {
    const btn = document.getElementById("pb-enviar");
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      const viagemAtual = state.roteiroHoje[0];
      await LIVE.criarOcorrencia({
        motorista_id: state.perfil.motorista_id,
        veiculo_placa: state.veiculo.placa,
        roteiro_id: viagemAtual ? viagemAtual.id : null,
        tipo: state.problemaTipo,
        descricao: document.getElementById("pb-desc").value.trim() || null,
        urgencia: state.problemaUrgencia,
      });
      document.getElementById("pb-desc").value = "";
      U.toast("Problema relatado. A equipe de frota vai avaliar.");
      renderMeusRelatos();
    } catch (e) {
      U.toast("Erro ao enviar: " + (e.message || e));
    } finally {
      btn.disabled = false; btn.textContent = "Enviar relato";
    }
  }

  /* ================================================================ primeiro acesso (obrigatório) */
  function renderEsqueletoAbas() {
    document.getElementById("mot-main").innerHTML = `
      <section id="aba-inicio" class="mot-aba"><div class="empty">Carregando…</div></section>
      <section id="aba-viagens" class="mot-aba" hidden></section>
      <section id="aba-problema" class="mot-aba" hidden></section>`;
  }

  function renderPrimeiroAcesso() {
    const m = state.motorista || {};
    document.getElementById("mot-main").innerHTML = `
      <div class="mot-content" style="padding-top:4px">
        <section>
          <div class="mot-secao-titulo">Complete seu cadastro</div>
          <div class="mot-linha2 mt">Antes de continuar, confirme ou preencha seus dados. Isso só aparece uma vez.</div>
        </section>

        <section>
          <div class="mot-secao-titulo">Dados pessoais</div>
          <div class="mot-form-field"><label>Nome completo</label><input id="pa-nome" value="${U.esc(m.nome || "")}"></div>
          <div class="mot-form-field"><label>CPF${!m.cpf ? '<span class="req">*</span>' : ""}</label>
            ${m.cpf
              ? `<input value="${U.esc(U.formatarCPF(m.cpf))}" disabled>`
              : `<input id="pa-cpf" placeholder="000.000.000-00" inputmode="numeric">`}
          </div>
          <div class="mot-form-field"><label>RG</label><input id="pa-rg" value="${U.esc(m.rg || "")}"></div>
          <div class="mot-form-field"><label>Data de nascimento</label><input type="date" id="pa-nascimento" value="${m.data_nascimento || ""}"></div>
        </section>

        <section>
          <div class="mot-secao-titulo">Contato</div>
          <div class="mot-form-field"><label>Telefone</label><input id="pa-telefone" value="${U.esc(m.telefone || "")}" placeholder="(11) 90000-0000"></div>
          <div class="mot-form-field"><label>Endereço</label><input id="pa-endereco" value="${U.esc(m.endereco || "")}" placeholder="rua, número, bairro"></div>
          <div class="mot-form-field"><label>Cidade</label><input id="pa-cidade" value="${U.esc(m.cidade || "")}"></div>
          <div class="mot-form-field"><label>UF</label><input id="pa-uf" maxlength="2" style="text-transform:uppercase" value="${U.esc(m.uf || "")}"></div>
          <div class="mot-form-field"><label>CEP</label><input id="pa-cep" value="${U.esc(m.cep || "")}"></div>
        </section>

        <section>
          <div class="mot-secao-titulo">CNH</div>
          <div class="mot-form-field"><label>Número da CNH</label><input id="pa-cnh" value="${U.esc(m.cnh || "")}"></div>
          <div class="mot-form-field"><label>Categoria</label><select id="pa-cnh-cat">
            <option value="">—</option>
            ${CNH_CATEGORIAS.map(c => `<option value="${c}" ${m.cnh_categoria === c ? "selected" : ""}>${c}</option>`).join("")}
          </select></div>
          <div class="mot-form-field"><label>Validade da CNH</label><input type="date" id="pa-cnh-val" value="${m.cnh_validade || ""}"></div>
        </section>

        <section>
          <div class="mot-secao-titulo">Contato de emergência</div>
          <div class="mot-form-field"><label>Nome</label><input id="pa-emerg-nome" value="${U.esc(m.contato_emergencia_nome || "")}"></div>
          <div class="mot-form-field"><label>Telefone</label><input id="pa-emerg-tel" value="${U.esc(m.contato_emergencia_telefone || "")}"></div>
        </section>

        <div id="pa-erro" class="mot-aviso" hidden></div>
        <button class="mot-btn-grande" id="pa-enviar">Confirmar cadastro</button>
      </div>`;
    document.getElementById("pa-enviar").onclick = enviarPrimeiroAcesso;
  }

  async function enviarPrimeiroAcesso() {
    const val = id => document.getElementById(id).value.trim();
    const campoCpf = document.getElementById("pa-cpf"); // só existe na tela se o motorista ainda não tinha CPF
    const payload = {
      nome: val("pa-nome") || null,
      rg: val("pa-rg") || null,
      data_nascimento: document.getElementById("pa-nascimento").value || null,
      telefone: val("pa-telefone"),
      endereco: val("pa-endereco"),
      cidade: val("pa-cidade") || null,
      uf: val("pa-uf").toUpperCase() || null,
      cep: val("pa-cep") || null,
      cnh: val("pa-cnh"),
      cnh_categoria: document.getElementById("pa-cnh-cat").value || null,
      cnh_validade: document.getElementById("pa-cnh-val").value,
      contato_emergencia_nome: val("pa-emerg-nome"),
      contato_emergencia_telefone: val("pa-emerg-tel"),
    };
    if (campoCpf) payload.cpf = campoCpf.value.replace(/\D/g, "");

    const faltando = [];
    if (campoCpf && !payload.cpf) faltando.push("CPF");
    if (!payload.telefone) faltando.push("telefone");
    if (!payload.endereco) faltando.push("endereço");
    if (!payload.cnh) faltando.push("número da CNH");
    if (!payload.cnh_validade) faltando.push("validade da CNH");
    if (!payload.contato_emergencia_nome) faltando.push("contato de emergência (nome)");
    if (!payload.contato_emergencia_telefone) faltando.push("contato de emergência (telefone)");
    const erroBox = document.getElementById("pa-erro");
    if (faltando.length) {
      erroBox.textContent = "Preencha: " + faltando.join(", ") + ".";
      erroBox.hidden = false;
      return;
    }
    if (campoCpf && payload.cpf && !U.validarCPF(payload.cpf)) {
      erroBox.textContent = "CPF inválido — confira os números digitados.";
      erroBox.hidden = false;
      return;
    }
    if (!U.cnhFormatoValido(payload.cnh)) {
      erroBox.textContent = "Número da CNH inválido — precisa ter 11 dígitos.";
      erroBox.hidden = false;
      return;
    }
    erroBox.hidden = true;
    const btn = document.getElementById("pa-enviar");
    btn.disabled = true; btn.textContent = "Salvando…";
    try {
      state.motorista = await LIVE.concluirPrimeiroAcesso(payload);
      state.perfil.cadastro_status = "completo";
      if (payload.nome) document.getElementById("mot-nome").textContent = payload.nome;
      U.toast("Cadastro confirmado!");
      await liberarPortal();
    } catch (e) {
      erroBox.textContent = "Erro ao salvar: " + (e.message || e);
      erroBox.hidden = false;
      btn.disabled = false; btn.textContent = "Confirmar cadastro";
    }
  }

  /* ================================================================ tour guiado */
  let tourPasso = 0;
  let tourAbaOriginal = null;

  function abrirTour() {
    tourPasso = 0;
    tourAbaOriginal = state.aba;
    renderTour();
  }

  function fecharTour(restaurarAba) {
    document.querySelectorAll(".tour-backdrop, .tour-card").forEach(el => el.remove());
    document.querySelectorAll(".mot-tab-btn").forEach(b => b.classList.remove("tour-destaque"));
    if (restaurarAba && tourAbaOriginal) mostrarAba(tourAbaOriginal);
  }

  function renderTour() {
    document.querySelectorAll(".tour-backdrop, .tour-card").forEach(el => el.remove());
    const passo = TOUR_PASSOS[tourPasso];
    mostrarAba(passo.aba);
    document.querySelectorAll(".mot-tab-btn").forEach(b => b.classList.toggle("tour-destaque", b.dataset.aba === passo.aba));

    const backdrop = document.createElement("div");
    backdrop.className = "tour-backdrop";
    document.body.appendChild(backdrop);

    const card = document.createElement("div");
    card.className = "tour-card";
    card.innerHTML = `
      <div class="tour-passo">Passo ${tourPasso + 1} de ${TOUR_PASSOS.length}</div>
      <div class="tour-titulo">${U.esc(passo.titulo)}</div>
      <div class="tour-texto">${U.esc(passo.texto)}</div>
      <div class="tour-nav">
        <button class="tour-pular" id="tour-pular">Pular tour</button>
        <div style="flex:1"></div>
        ${tourPasso > 0 ? '<button class="btn btn-sm" id="tour-voltar">Voltar</button>' : ""}
        <button class="btn btn-sm btn-primary" id="tour-avancar">${tourPasso === TOUR_PASSOS.length - 1 ? "Finalizar" : "Avançar"}</button>
      </div>`;
    document.body.appendChild(card);

    document.getElementById("tour-pular").onclick = async () => {
      fecharTour(true);
      try { await LIVE.registrarTourMotorista("cancelado"); } catch (_) { /* fechar o tour não pode travar por causa disso */ }
    };
    const btnVoltar = document.getElementById("tour-voltar");
    if (btnVoltar) btnVoltar.onclick = () => { tourPasso--; renderTour(); };
    document.getElementById("tour-avancar").onclick = async () => {
      if (tourPasso < TOUR_PASSOS.length - 1) { tourPasso++; renderTour(); return; }
      fecharTour(true);
      try { await LIVE.registrarTourMotorista("concluido"); } catch (_) { /* idem */ }
    };
  }

  /* libera o portal de verdade: reconstrói as 4 abas (o formulário de primeiro
     acesso, se apareceu, substituiu esse HTML), carrega os dados e — na
     primeira vez — dispara o tour sozinho. */
  async function liberarPortal() {
    const btnAjuda = document.getElementById("btn-ajuda");
    btnAjuda.hidden = false;
    btnAjuda.onclick = () => abrirTour();

    renderEsqueletoAbas();
    montarTabBar();

    try {
      state.motorista = await LIVE.motoristaPorId(state.perfil.motorista_id);
      await carregarTudo();
      mostrarAba("inicio");
    } catch (e) {
      document.getElementById("mot-main").innerHTML = `<div class="mot-aviso">Não foi possível carregar seus dados: ${U.esc(e.message || e)}</div>`;
      return;
    }

    if (!state.perfil.tour_concluido_em && !state.perfil.tour_cancelado_em) {
      abrirTour();
    }
  }

  /* ================================================================ carga inicial */
  async function carregarTudo() {
    const [roteiroHoje, roteiroProximo, fretes, vales, veiculo, viagemAtual] = await Promise.all([
      LIVE.roteiro(HOJE, HOJE),
      LIVE.roteiro(U.addDias(HOJE, 1), U.addDias(HOJE, 14)),
      LIVE.meusFretes(30),
      LIVE.meusVales(),
      LIVE.meuVeiculo(),
      LIVE.minhaViagemAtual(),
    ]);
    state.roteiroHoje = roteiroHoje; state.roteiroProximo = roteiroProximo;
    state.fretes = fretes; state.vales = vales; state.veiculo = veiculo;
    state.viagemAtual = viagemAtual;

    renderInicio(); renderViagens(); renderProblema();
  }

  async function iniciar() {
    const { data } = await sb.auth.getSession();
    if (!data.session) { location.replace("login.html"); return; }

    document.getElementById("btn-sair").onclick = async () => {
      await sb.auth.signOut();
      location.replace("login.html");
    };

    let { data: perfil, error: erroPerfil } = await sb
      .from("perfis").select("nome,papel,motorista_id,ativo,cadastro_status,tour_concluido_em,tour_cancelado_em")
      .eq("user_id", data.session.user.id).single();

    if (erroPerfil && erroPerfil.code === "42703") {
      // banco ainda sem o patch_016 (colunas novas) — não bloqueia ninguém por causa disso,
      // só não oferece primeiro acesso/tour até o patch rodar
      const retry = await sb.from("perfis").select("nome,papel,motorista_id,ativo")
        .eq("user_id", data.session.user.id).single();
      perfil = retry.data ? { ...retry.data, cadastro_status: "completo", tour_concluido_em: new Date().toISOString(), tour_cancelado_em: null } : null;
      erroPerfil = retry.error;
    }

    if (erroPerfil || !perfil) {
      document.getElementById("mot-main").innerHTML = `<div class="mot-aviso">Não encontramos seu perfil de acesso. Fale com o administrador.</div>`;
      return;
    }
    if (perfil.ativo === false) {
      await sb.auth.signOut();
      location.replace("login.html?desativado=1");
      return;
    }
    if (perfil.papel !== "motorista") {
      // login de equipe caiu aqui por engano -> manda pro painel completo
      location.replace("index.html");
      return;
    }
    document.getElementById("mot-nome").textContent = perfil.nome || "Motorista";
    if (!perfil.motorista_id) {
      document.getElementById("mot-main").innerHTML = `<div class="mot-aviso">Seu login não está vinculado a um cadastro de motorista. Fale com o administrador para corrigir o vínculo.</div>`;
      return;
    }

    state.perfil = perfil;

    try {
      state.motorista = await LIVE.motoristaPorId(perfil.motorista_id);
    } catch (e) {
      document.getElementById("mot-main").innerHTML = `<div class="mot-aviso">Não foi possível carregar seus dados: ${U.esc(e.message || e)}</div>`;
      return;
    }

    if (perfil.cadastro_status !== "completo") {
      renderPrimeiroAcesso();
      return;
    }

    await liberarPortal();
  }

  iniciar();
})();
