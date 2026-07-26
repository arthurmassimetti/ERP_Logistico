/* Motoristas — cadastro base, extrato individual e vínculo de login (dados vivos do Supabase). */
(function () {
  const U = window.U;
  const LIMITE_EXTRATO = 30;
  const HOJE = U.hojeISO();

  function nomeMes(mesRef) {
    const [ano, mes] = mesRef.split("-");
    const nomes = ["janeiro","fevereiro","março","abril","maio","junho",
                   "julho","agosto","setembro","outubro","novembro","dezembro"];
    return `${nomes[parseInt(mes, 10) - 1]}/${ano}`;
  }

  /* ganho do motorista = comissão fixa + fatia da diária que ele recebe (nunca a diária total) */
  function resumoMes(fretes, vales, mesRef) {
    const fretesMes = fretes.filter(f => f.data && f.data.slice(0, 7) === mesRef);
    const valesMes = vales.filter(v => v.data && v.data.slice(0, 7) === mesRef);
    const comissaoMes = U.sum(fretesMes, f => f.comissao);
    const diariaMes = U.sum(fretesMes, f => f.diaria_motorista);
    const ganhoMes = comissaoMes + diariaMes;
    const valesMesValor = U.sum(valesMes, v => v.valor);
    return {
      viagens: fretesMes.length, comissaoMes, diariaMes, ganhoMes,
      valesMesValor, aReceber: ganhoMes - valesMesValor,
    };
  }

  const PAPEIS = [
    { v: "admin", r: "Admin" }, { v: "financeiro", r: "Financeiro" },
    { v: "operacional", r: "Operacional" }, { v: "motorista", r: "Motorista" },
  ];
  const rotuloPapel = p => (PAPEIS.find(x => x.v === p) || {}).r || p || "—";

  const DISPONIBILIDADES = [
    { v: "disponivel", r: "Disponível" }, { v: "em_viagem", r: "Em viagem" },
    { v: "afastado", r: "Afastado" }, { v: "inativo", r: "Inativo" },
  ];

  const state = { busca: "", mostrarInativos: false, dados: null, erro: null };

  function gerarSenha() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let s = ""; for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function filtrar() {
    if (!state.dados) return [];
    return state.dados.filter(m => {
      if (!state.mostrarInativos && !m.ativo) return false;
      if (state.busca) {
        const q = state.busca.toLowerCase();
        if (!`${m.nome} ${m.cpf || ""}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function tagLogin(m) {
    const perfil = (m.perfis || [])[0];
    if (!perfil) return '<span class="tag tag-neutro">sem login</span>';
    return `<span class="tag tag-ok">${U.esc(rotuloPapel(perfil.papel))}</span>`;
  }

  /* ---------------------------------------------------------------- lista */
  function view() {
    return `
    <div class="filters">
      <div class="field"><label>Buscar</label><input type="search" id="mf-busca" placeholder="nome ou CPF…"></div>
      <div class="field"><label class="check-inline"><input type="checkbox" id="mf-inativos"> mostrar inativos</label></div>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="btn-novo-motorista" disabled>+ Motorista</button>
    </div>
    <div id="mot-tbl"><div class="empty">Carregando motoristas…</div></div>`;
  }

  function tabela() {
    const ms = filtrar();
    if (!ms.length) {
      document.getElementById("mot-tbl").innerHTML =
        `<div class="empty">${state.erro ? U.esc(state.erro) : "Nenhum motorista para os filtros."}</div>`;
      return;
    }
    const rows = ms.map(m => `
      <tr class="clickable ${!m.ativo ? "muted" : ""}" data-id="${m.id}">
        <td class="td-main">${U.esc(m.nome)} ${!m.ativo ? '<span class="tag tag-neutro">inativo</span>' : ""}</td>
        <td class="mono">${U.esc(m.cpf || "—")}</td>
        <td>${U.esc(m.telefone || "—")}</td>
        <td class="mono">${m.veiculos && m.veiculos[0] ? U.placaFmt(m.veiculos[0].placa) : "—"}</td>
        <td>${U.tagDisponibilidade(m.disponibilidade)}</td>
        <td>${tagLogin(m)}</td>
        <td><button class="btn btn-sm btn-ghost">extrato →</button></td>
      </tr>`).join("");
    document.getElementById("mot-tbl").innerHTML = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Motorista</th><th>CPF</th><th>Telefone</th><th>Veículo</th><th>Disponibilidade</th><th>Login</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    document.querySelectorAll("#mot-tbl tr.clickable").forEach(tr => {
      tr.onclick = () => { location.hash = "#/motoristas/" + tr.dataset.id; };
    });
  }

  /* ---------------------------------------------------------- form cadastro */
  function formMotorista(existente) {
    const ed = !!existente;
    const g = (c, d) => ed ? (existente[c] ?? d) : d;
    U.openDrawer({
      titulo: ed ? "Editar motorista" : "Novo motorista",
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Nome<span class="req">*</span></label><input id="mform-nome" value="${U.esc(g("nome", ""))}" placeholder="nome completo"></div>
        <div><label>CPF</label><input id="mform-cpf" value="${U.esc(g("cpf", "") || "")}" placeholder="000.000.000-00"></div>
        <div><label>RG</label><input id="mform-rg" value="${U.esc(g("rg", "") || "")}"></div>
        <div><label>CNH</label><input id="mform-cnh" value="${U.esc(g("cnh", "") || "")}"></div>
        <div><label>Categoria da CNH</label><input id="mform-cnh-cat" value="${U.esc(g("cnh_categoria", "") || "")}" placeholder="ex: E"></div>
        <div><label>Validade da CNH</label><input type="date" id="mform-cnh-val" value="${g("cnh_validade", "") || ""}"></div>
        <div><label>Telefone</label><input id="mform-tel" value="${U.esc(g("telefone", "") || "")}" placeholder="(11) 90000-0000"></div>
        <div><label>Disponibilidade</label><select id="mform-disp">
          ${DISPONIBILIDADES.map(d => `<option value="${d.v}" ${g("disponibilidade", "disponivel") === d.v ? "selected" : ""}>${d.r}</option>`).join("")}
        </select></div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório</div>
      </div>`,
      rodape: `
        <button class="btn" id="mform-cancel">Cancelar</button>
        <button class="btn btn-primary" id="mform-save">${ed ? "Salvar alterações" : "Cadastrar motorista"}</button>`,
    });
    document.getElementById("mform-cancel").onclick = U.closeDrawer;
    document.getElementById("mform-save").onclick = async () => {
      const val = id => document.getElementById(id).value.trim();
      const nome = val("mform-nome");
      if (!nome) { U.toast("Preencha o nome."); return; }
      const payload = {
        nome, cpf: val("mform-cpf") || null, rg: val("mform-rg") || null,
        cnh: val("mform-cnh") || null, telefone: val("mform-tel") || null,
        cnh_categoria: val("mform-cnh-cat") || null,
        cnh_validade: document.getElementById("mform-cnh-val").value || null,
        disponibilidade: document.getElementById("mform-disp").value,
      };
      const btn = document.getElementById("mform-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        if (ed) {
          await LIVE.atualizarMotorista(existente.id, payload);
        } else {
          await LIVE.criarMotorista(payload);
        }
        U.closeDrawer();
        U.toast(ed ? "Motorista atualizado." : "Motorista cadastrado.");
        window.APP.rerender();
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = ed ? "Salvar alterações" : "Cadastrar motorista";
      }
    };
  }

  async function alternarAtivo(m) {
    try {
      const salvo = await LIVE.atualizarMotorista(m.id, { ativo: !m.ativo });
      U.toast(salvo.ativo ? "Motorista reativado." : "Motorista desativado.");
      window.APP.rerender();
    } catch (e) {
      U.toast("Erro: " + (e.message || e));
    }
  }

  /* --------------------------------------------------- vincular login */
  function formVincularLogin(m) {
    const senhaInicial = gerarSenha();
    U.openDrawer({
      titulo: "Vincular login",
      sub: `Cria o acesso de ${U.esc(m.nome)} ao sistema, com um nível de permissão.`,
      corpo: `
      <div class="form-grid">
        <div class="full"><label>E-mail<span class="req">*</span></label><input id="vl-email" type="email" placeholder="motorista@phorteaguiar.com.br"></div>
        <div class="full"><label>Senha temporária<span class="req">*</span></label>
          <div class="login-senha"><input id="vl-senha" value="${senhaInicial}"><button type="button" id="vl-gerar" tabindex="-1">gerar outra</button></div>
        </div>
        <div class="full"><label>Nível de permissão</label><select id="vl-papel">
          ${PAPEIS.map(p => `<option value="${p.v}" ${p.v === "motorista" ? "selected" : ""}>${p.r}</option>`).join("")}
        </select></div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório · anote e entregue essas credenciais ao motorista — a senha não pode ser recuperada depois daqui.</div>
      </div>`,
      rodape: `
        <button class="btn" id="vl-cancel">Cancelar</button>
        <button class="btn btn-primary" id="vl-save">Criar login</button>`,
    });
    document.getElementById("vl-gerar").onclick = () => { document.getElementById("vl-senha").value = gerarSenha(); };
    document.getElementById("vl-cancel").onclick = U.closeDrawer;
    document.getElementById("vl-save").onclick = async () => {
      const email = document.getElementById("vl-email").value.trim();
      const senha = document.getElementById("vl-senha").value;
      const papel = document.getElementById("vl-papel").value;
      if (!email || senha.length < 8) { U.toast("Informe um e-mail e uma senha com pelo menos 8 caracteres."); return; }
      const btn = document.getElementById("vl-save");
      btn.disabled = true; btn.textContent = "Criando…";
      try {
        await LIVE.criarUsuario({ email, senha, nome: m.nome, papel, motorista_id: m.id });
        U.closeDrawer();
        U.toast("Login criado: " + email);
        window.APP.rerender();
      } catch (e) {
        U.toast("Erro ao criar login: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Criar login";
      }
    };
  }

  /* --------------------------------------------------- lançar vale (adiantamento) */
  function formVale(m) {
    U.openDrawer({
      titulo: `Lançar vale — ${U.esc(m.nome)}`,
      sub: "Adiantamento que será descontado do que ele tem a receber no mês.",
      corpo: `
      <div class="form-grid">
        <div><label>Data<span class="req">*</span></label><input type="date" id="vf-data" value="${HOJE}"></div>
        <div><label>Valor (R$)<span class="req">*</span></label><input type="number" id="vf-valor" step="0.01" min="0" value=""></div>
        <div class="full"><label>Descrição</label><input id="vf-desc" placeholder="opcional"></div>
        <div class="full form-note"><span class="req">*</span> campo obrigatório</div>
      </div>`,
      rodape: `
        <button class="btn" id="vf-cancel">Cancelar</button>
        <button class="btn btn-primary" id="vf-save">Lançar vale</button>`,
    });
    document.getElementById("vf-cancel").onclick = U.closeDrawer;
    document.getElementById("vf-save").onclick = async () => {
      const valor = parseFloat(document.getElementById("vf-valor").value) || 0;
      const data = document.getElementById("vf-data").value;
      if (!data || valor <= 0) { U.toast("Informe data e um valor maior que zero."); return; }
      const payload = {
        motorista_id: m.id,
        data,
        valor,
        descricao: document.getElementById("vf-desc").value.trim() || null,
      };
      const btn = document.getElementById("vf-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        await LIVE.criarVale(payload);
        U.closeDrawer();
        U.toast("Vale lançado.");
        window.APP.rerender();
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Lançar vale";
      }
    };
  }

  /* ---------------------------------------------------------------- extrato */
  function detalhe(id) {
    return `
    <a class="btn btn-sm" href="#/motoristas">← voltar</a>
    <div id="mot-detalhe" class="mt"><div class="empty">Carregando extrato…</div></div>`;
  }

  async function bindDetalhe(id) {
    const alvo = document.getElementById("mot-detalhe");
    let m, fretes, vales, frota;
    try {
      [m, fretes, vales, frota] = await Promise.all([
        LIVE.motoristaPorId(id), LIVE.fretesPorMotorista(id), LIVE.valesPorMotorista(id), LIVE.frota(),
      ]);
    } catch (e) {
      alvo.innerHTML = `<div class="empty">Não foi possível carregar este motorista: ${U.esc(e.message || e)}</div>`;
      return;
    }
    const cavalos = frota.filter(v => v.tipo === "cavalo");
    const veiculoAtual = m.veiculos && m.veiculos[0] ? m.veiculos[0].placa : "";
    document.getElementById("page-title").textContent = m.nome;

    const stats = {
      viagens: fretes.length,
      fretes: U.sum(fretes, f => f.valor_frete),
      comissoes: U.sum(fretes, f => f.comissao),
      diarias: U.sum(fretes, f => f.diaria_motorista),
    };
    const mesAtual = HOJE.slice(0, 7);
    const resumo = resumoMes(fretes, vales, mesAtual);
    const perfil = (m.perfis || [])[0];

    alvo.innerHTML = `
      <div class="grid-2">
        <div class="card card-pad">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <h2 style="font-size:16px">${U.esc(m.nome)} ${!m.ativo ? '<span class="tag tag-neutro">inativo</span>' : ""}</h2>
          </div>
          <dl class="kv mt">
            <dt>CPF</dt><dd>${U.esc(m.cpf || "—")}</dd>
            <dt>RG</dt><dd>${U.esc(m.rg || "—")}</dd>
            <dt>CNH</dt><dd>${U.esc(m.cnh || "—")}${m.cnh_categoria ? " · categoria " + U.esc(m.cnh_categoria) : ""}</dd>
            <dt>Validade da CNH</dt><dd>${m.cnh_validade ? U.vencTag(m.cnh_validade) : "—"}</dd>
            <dt>Telefone</dt><dd>${U.esc(m.telefone || "—")}</dd>
            <dt>Veículo vinculado</dt><dd><select id="md-veiculo" class="select-sm">
              <option value="">sem veículo</option>
              ${cavalos.map(v => {
                const ocupado = v.motorista_id && v.motorista_id !== m.id && v.motoristas ? ` (com ${v.motoristas.nome})` : "";
                return `<option value="${v.placa}" ${veiculoAtual === v.placa ? "selected" : ""}>${U.placaFmt(v.placa)}${U.esc(ocupado)}</option>`;
              }).join("")}
            </select></dd>
            <dt>Disponibilidade</dt><dd><select id="md-disp" class="select-sm">
              ${DISPONIBILIDADES.map(d => `<option value="${d.v}" ${(m.disponibilidade || "disponivel") === d.v ? "selected" : ""}>${d.r}</option>`).join("")}
            </select></dd>
            <dt>Login</dt><dd>${perfil ? `criado · nível <b>${U.esc(rotuloPapel(perfil.papel))}</b>` : "sem login vinculado"}</dd>
          </dl>
          <div class="mt" style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm" id="md-editar">Editar dados</button>
            <button class="btn btn-sm" id="md-ativo">${m.ativo ? "Desativar" : "Reativar"}</button>
            ${!perfil ? '<button class="btn btn-sm btn-primary" id="md-login">Vincular login</button>' : ""}
          </div>
        </div>
        <div>
          <div class="kpi-grid" style="grid-template-columns:1fr 1fr">
            <div class="kpi"><div class="kpi-label">Viagens</div><div class="kpi-value">${stats.viagens}</div></div>
            <div class="kpi"><div class="kpi-label">Total de fretes</div><div class="kpi-value">${U.money(stats.fretes)}</div></div>
            <div class="kpi"><div class="kpi-label">Comissões</div><div class="kpi-value">${U.money(stats.comissoes)}</div></div>
            <div class="kpi"><div class="kpi-label">Diárias (motorista)</div><div class="kpi-value">${U.money(stats.diarias)}</div></div>
          </div>

          <div class="card card-pad mt">
            <div class="section-title" style="margin-top:0">Resumo de ${nomeMes(mesAtual)}</div>
            <div class="kpi-grid" style="grid-template-columns:1fr 1fr">
              <div class="kpi"><div class="kpi-label">Viagens no mês</div><div class="kpi-value">${resumo.viagens}</div></div>
              <div class="kpi"><div class="kpi-label">Comissões</div><div class="kpi-value">${U.money(resumo.comissaoMes)}</div></div>
              <div class="kpi"><div class="kpi-label">Diárias</div><div class="kpi-value">${U.money(resumo.diariaMes)}</div></div>
              <div class="kpi"><div class="kpi-label">Ganho no mês</div><div class="kpi-value">${U.money(resumo.ganhoMes)}</div></div>
            </div>
            <div class="calc-line mt"><span>Vales lançados no mês</span><b>− ${U.money(resumo.valesMesValor)}</b></div>
            <div class="calc-line"><span>A receber no fim do mês</span><b>${U.money(resumo.aReceber)}</b></div>
          </div>

          <div class="card card-pad mt">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
              <div class="section-title" style="margin-top:0">Vales</div>
              <button class="btn btn-sm btn-primary" id="md-vale">+ Lançar vale</button>
            </div>
            ${vales.length ? vales.map(v => `
              <div class="fleet-row">
                <span class="lbl">${U.dBR(v.data)} · ${U.esc(v.descricao || "vale")} · ${U.money(v.valor)}</span>
                <span class="val">${v.saldo > 0 ? `<span class="tag tag-warn">saldo ${U.money(v.saldo)}</span>` : '<span class="tag tag-ok">quitado</span>'}</span>
              </div>`).join("") : '<div class="muted">nenhum vale lançado</div>'}
          </div>
        </div>
      </div>

      <div class="section-title">Fretes <span class="count-pill">${fretes.length} registro(s)</span></div>
      ${fretes.length ? `
      <div class="table-wrap"><table class="tbl" style="min-width:0">
        <thead><tr><th>Data</th><th>Origem / destino</th><th>Transportadora</th><th class="num">Frete</th><th class="num">Comissão</th><th class="num">Diária (motorista)</th></tr></thead>
        <tbody>
          ${fretes.slice(0, LIMITE_EXTRATO).map(f => `
            <tr><td class="mono">${U.dBR(f.data)}</td>
            <td><div class="td-main">${U.esc(f.origem || "—")}</div><div class="td-sub">→ ${U.esc(f.destino || "—")}</div></td>
            <td>${U.esc(f.transportadora || "—")}</td>
            <td class="num">${U.money(f.valor_frete)}</td>
            <td class="num">${U.money(f.comissao)}</td>
            <td class="num">${f.diaria_motorista ? U.money(f.diaria_motorista) : "—"}</td></tr>`).join("")}
        </tbody>
        <tfoot><tr><td colspan="3">Total</td><td class="num">${U.money(stats.fretes)}</td><td class="num">${U.money(stats.comissoes)}</td><td class="num">${U.money(stats.diarias)}</td></tr></tfoot>
      </table></div>
      ${fretes.length > LIMITE_EXTRATO ? `<div class="legend-note">Mostrando os ${LIMITE_EXTRATO} mais recentes de ${fretes.length}.</div>` : ""}
      ` : '<div class="empty">Nenhum frete lançado para este motorista.</div>'}`;

    document.getElementById("md-editar").onclick = () => formMotorista(m);
    document.getElementById("md-ativo").onclick = () => alternarAtivo(m);
    document.getElementById("md-disp").onchange = async (e) => {
      const nova = e.target.value;
      try {
        await LIVE.atualizarMotorista(m.id, { disponibilidade: nova });
        m.disponibilidade = nova;
        U.toast("Disponibilidade atualizada.");
      } catch (err) {
        e.target.value = m.disponibilidade || "disponivel";
        U.toast("Erro ao atualizar disponibilidade: " + (err.message || err));
      }
    };
    document.getElementById("md-veiculo").onchange = async (e) => {
      const novaPlaca = e.target.value || null;
      e.target.disabled = true;
      try {
        await LIVE.atribuirVeiculoAoMotorista(m.id, novaPlaca);
        U.toast(novaPlaca ? "Veículo vinculado." : "Motorista ficou sem veículo.");
        bindDetalhe(id);
      } catch (err) {
        U.toast("Erro ao vincular veículo: " + (err.message || err));
        e.target.disabled = false;
        e.target.value = veiculoAtual;
      }
    };
    document.getElementById("md-vale").onclick = () => formVale(m);
    const btnLogin = document.getElementById("md-login");
    if (btnLogin) btnLogin.onclick = () => formVincularLogin(m);
  }

  /* ---------------------------------------------------------------- carga */
  async function recarregarLista() {
    try {
      state.dados = await LIVE.todosMotoristas();
      state.erro = null;
    } catch (e) {
      state.dados = [];
      state.erro = "Não foi possível carregar os motoristas: " + (e.message || e);
    }
    tabela();
  }

  function bind() {
    document.getElementById("mf-busca").addEventListener("input", e => { state.busca = e.target.value; tabela(); });
    document.getElementById("mf-inativos").addEventListener("change", e => { state.mostrarInativos = e.target.checked; tabela(); });
    document.getElementById("btn-novo-motorista").addEventListener("click", () => formMotorista(null));
    recarregarLista().then(() => { document.getElementById("btn-novo-motorista").disabled = false; });
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.motoristas = {
    title: "Motoristas",
    sub: "Cadastro, extrato e acesso ao sistema",
    tituloDetalhe: "Motoristas · extrato",
    render: view, bind,
    detalhe, bindDetalhe,
  };
})();
