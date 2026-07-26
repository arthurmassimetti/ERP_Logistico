/* Portal do motorista — 4 abas (Início / Viagens / Checklist / Relatar problema).
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
    { id: "checklist", rotulo: "Checklist", icone: "check" },
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

  const state = {
    aba: "inicio",
    perfil: null, motorista: null, veiculo: null,
    roteiroHoje: [], roteiroProximo: [], fretes: [], vales: [],
    checklistHoje: null, checklistRespostas: {},
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
    const valesAbertos = (state.vales || []).filter(v => v.saldo > 0);
    if (valesAbertos.length) alertas.push(`Você tem ${valesAbertos.length} vale(s) com saldo a descontar.`);
    if (!state.veiculo) alertas.push("Você ainda não tem um veículo vinculado. Fale com o administrador.");
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
  function renderViagens() {
    const alvo = document.getElementById("aba-viagens");
    const tarefaHoje = state.roteiroHoje[0];

    alvo.innerHTML = `
      <section>
        <div class="mot-secao-titulo">Tarefa atual</div>
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
          ${state.fretes.length ? state.fretes.slice(0, 20).map(f => `
            <div class="mot-card">
              <div class="mot-linha1">${U.esc(f.origem || "—")} → ${U.esc(f.destino || "—")}</div>
              <div class="mot-linha2">${U.dBRfull(f.data)} · ${U.esc(f.transportadora || "—")}</div>
              <div class="mot-linha3"><span class="tag tag-ok">comissão ${U.money(f.comissao)}</span>${f.diaria ? `<span class="tag tag-info">diária ${U.money(f.diaria)}</span>` : ""}</div>
            </div>`).join("") : `<div class="empty">Nenhuma viagem no histórico ainda.</div>`}
        </div>
      </section>`;
  }

  /* ================================================================ aba Checklist */
  function renderChecklist() {
    const alvo = document.getElementById("aba-checklist");

    if (!state.veiculo) {
      alvo.innerHTML = `
        <div class="mot-secao-titulo">Checklist do veículo</div>
        <div class="mot-aviso mt">Você ainda não tem um veículo vinculado. Fale com o administrador antes de enviar o checklist.</div>`;
      return;
    }

    if (state.checklistHoje) {
      const itens = state.checklistHoje.itens || {};
      alvo.innerHTML = `
        <div class="mot-secao-titulo">Checklist de hoje</div>
        <div class="mot-confirma mt">Checklist enviado às ${(state.checklistHoje.criado_em || "").slice(11, 16)}.</div>
        <div class="mt">
          ${ITENS_CHECKLIST.map(it => `
            <div class="chk-item">
              <div class="chk-item-nome">${it.rotulo}</div>
              <div class="mot-linha3">${itens[it.chave] === "problema" ? '<span class="tag tag-danger">problema</span>' : '<span class="tag tag-ok">OK</span>'}</div>
            </div>`).join("")}
          ${state.checklistHoje.observacao ? `<div class="mot-card"><div class="mot-linha2">${U.esc(state.checklistHoje.observacao)}</div></div>` : ""}
        </div>
        <div class="legend-note mt">Já enviado hoje para ${U.placaFmt(state.veiculo.placa)}. Novo envio libera amanhã.</div>`;
      return;
    }

    alvo.innerHTML = `
      <div class="mot-secao-titulo">Checklist — ${U.placaFmt(state.veiculo.placa)}</div>
      <div class="mt">
        ${ITENS_CHECKLIST.map(it => `
          <div class="chk-item">
            <div class="chk-item-nome">${it.rotulo}</div>
            <div class="chk-opcoes">
              <button type="button" class="chk-opt ok" data-item="${it.chave}" data-valor="ok">${U.icons.check} OK</button>
              <button type="button" class="chk-opt problema" data-item="${it.chave}" data-valor="problema">${U.icons.alert} Problema</button>
            </div>
          </div>`).join("")}
      </div>
      <div class="mot-form-field mt">
        <label>Observação (opcional)</label>
        <textarea id="chk-obs" placeholder="algo a mais que você notou"></textarea>
      </div>
      <button class="mot-btn-grande" id="chk-enviar">Enviar checklist</button>`;

    alvo.querySelectorAll(".chk-opt").forEach(btn => {
      btn.onclick = () => {
        const item = btn.dataset.item, valor = btn.dataset.valor;
        state.checklistRespostas[item] = valor;
        alvo.querySelectorAll(`.chk-opt[data-item="${item}"]`).forEach(b => b.classList.toggle("selecionado", b.dataset.valor === valor));
      };
    });
    document.getElementById("chk-enviar").onclick = enviarChecklist;
  }

  async function enviarChecklist() {
    const faltando = ITENS_CHECKLIST.filter(it => !state.checklistRespostas[it.chave]);
    if (faltando.length) { U.toast("Responda todos os itens: " + faltando.map(f => f.rotulo).join(", ")); return; }

    const btn = document.getElementById("chk-enviar");
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      const salvo = await LIVE.criarChecklist({
        tipo: "pre_viagem",
        motorista_id: state.perfil.motorista_id,
        veiculo_placa: state.veiculo.placa,
        itens: state.checklistRespostas,
        observacao: document.getElementById("chk-obs").value.trim() || null,
      });
      state.checklistHoje = salvo;
      U.toast("Checklist enviado.");
      renderChecklist();
    } catch (e) {
      if (e.code === "23505") {
        U.toast("Você já enviou o checklist de hoje para este veículo.");
        state.checklistHoje = await LIVE.meuChecklistHoje(state.veiculo.placa);
        renderChecklist();
      } else {
        U.toast("Erro ao enviar: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Enviar checklist";
      }
    }
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

  /* ================================================================ carga inicial */
  async function carregarTudo() {
    const [roteiroHoje, roteiroProximo, fretes, vales, veiculo] = await Promise.all([
      LIVE.roteiro(HOJE, HOJE),
      LIVE.roteiro(U.addDias(HOJE, 1), U.addDias(HOJE, 14)),
      LIVE.meusFretes(30),
      LIVE.meusVales(),
      LIVE.meuVeiculo(),
    ]);
    state.roteiroHoje = roteiroHoje; state.roteiroProximo = roteiroProximo;
    state.fretes = fretes; state.vales = vales; state.veiculo = veiculo;

    if (veiculo) state.checklistHoje = await LIVE.meuChecklistHoje(veiculo.placa);

    renderInicio(); renderViagens(); renderChecklist(); renderProblema();
  }

  async function iniciar() {
    const { data } = await sb.auth.getSession();
    if (!data.session) { location.replace("login.html"); return; }

    document.getElementById("btn-sair").onclick = async () => {
      await sb.auth.signOut();
      location.replace("login.html");
    };

    const { data: perfil, error: erroPerfil } = await sb
      .from("perfis").select("nome,papel,motorista_id").eq("user_id", data.session.user.id).single();

    if (erroPerfil || !perfil) {
      document.getElementById("mot-main").innerHTML = `<div class="mot-aviso">Não encontramos seu perfil de acesso. Fale com o administrador.</div>`;
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
    montarTabBar();

    try {
      state.motorista = await LIVE.motoristaPorId(perfil.motorista_id);
      await carregarTudo();
      mostrarAba("inicio");
    } catch (e) {
      document.getElementById("mot-main").innerHTML = `<div class="mot-aviso">Não foi possível carregar seus dados: ${U.esc(e.message || e)}</div>`;
    }
  }

  iniciar();
})();
