/* Usuários e acessos — cria/edita/reseta senha/exclui login de qualquer papel.
   Só admin consegue (a Edge Function admin-usuarios verifica de novo no servidor). */
(function () {
  const U = window.U;
  const state = { usuarios: [], motoristas: [], erro: null, meuUserId: null };

  const PAPEIS = [
    { v: "admin", r: "Admin" }, { v: "financeiro", r: "Financeiro" },
    { v: "operacional", r: "Operacional" }, { v: "motorista", r: "Motorista" },
  ];
  const rotuloPapel = p => (PAPEIS.find(x => x.v === p) || {}).r || p || "—";

  function view() {
    return `
    <div class="filters">
      <div class="spacer"></div>
      <button class="btn btn-primary" id="btn-novo-usuario" disabled>+ Novo acesso</button>
    </div>
    <div id="usr-tbl"><div class="empty">Carregando usuários…</div></div>`;
  }

  function fmtAcesso(iso) {
    if (!iso) return '<span class="muted">nunca acessou</span>';
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function tabela() {
    const alvo = document.getElementById("usr-tbl");
    if (state.erro) { alvo.innerHTML = `<div class="empty">${U.esc(state.erro)}</div>`; return; }
    if (!state.usuarios.length) { alvo.innerHTML = `<div class="empty">Nenhum usuário cadastrado.</div>`; return; }

    const rows = state.usuarios.map(u => `
      <tr class="${u.ativo === false ? "muted" : ""}">
        <td class="td-main">${U.esc(u.nome || "—")} ${u.ativo === false ? '<span class="tag tag-neutro">inativo</span>' : ""}</td>
        <td>${U.esc(u.email)}</td>
        <td>${u.papel ? `<span class="tag tag-ok">${U.esc(rotuloPapel(u.papel))}</span>` : '<span class="tag tag-neutro">sem perfil</span>'}</td>
        <td>${fmtAcesso(u.ultimo_acesso)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm btn-ghost" data-editar="${u.user_id}">editar</button>
          <button class="btn btn-sm btn-ghost" data-senha="${u.user_id}">resetar senha</button>
          <button class="btn btn-sm btn-ghost" data-toggle="${u.user_id}">${u.ativo === false ? "reativar" : "desativar"}</button>
          ${u.user_id !== state.meuUserId ? `<button class="btn btn-sm btn-ghost" data-excluir="${u.user_id}">excluir</button>` : ""}
        </td>
      </tr>`).join("");

    alvo.innerHTML = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Último acesso</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;

    alvo.querySelectorAll("[data-editar]").forEach(b => b.onclick = () => formEditar(state.usuarios.find(u => u.user_id === b.dataset.editar)));
    alvo.querySelectorAll("[data-senha]").forEach(b => b.onclick = () => formResetarSenha(state.usuarios.find(u => u.user_id === b.dataset.senha)));
    alvo.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => alternarAtivo(state.usuarios.find(u => u.user_id === b.dataset.toggle)));
    alvo.querySelectorAll("[data-excluir]").forEach(b => b.onclick = () => confirmarExclusao(state.usuarios.find(u => u.user_id === b.dataset.excluir)));
  }

  /* motoristas sem nenhum login vinculado ainda (o banco só permite 1 login por motorista).
     "perfis" vem da embed do Supabase — como motorista_id é único em perfis, o
     PostgREST devolve objeto (1:1), não array, então não dá pra confiar em .length. */
  function motoristasDisponiveis(motoristaAtualId) {
    return state.motoristas.filter(m => {
      const perfil = Array.isArray(m.perfis) ? m.perfis[0] : m.perfis;
      return !perfil || m.id === motoristaAtualId;
    });
  }

  function selectMotorista(id, motoristaAtualId) {
    const opcoes = motoristasDisponiveis(motoristaAtualId);
    return `<select id="${id}">
      <option value="">nenhum</option>
      ${opcoes.map(m => `<option value="${m.id}" ${m.id === motoristaAtualId ? "selected" : ""}>${U.esc(m.nome)}</option>`).join("")}
    </select>`;
  }

  /* --------------------------------------------------------------- criar */
  function formNovo() {
    const senhaInicial = U.gerarSenha();
    U.openDrawer({
      titulo: "Novo acesso",
      sub: "Cria o login e o nível de permissão de uma vez.",
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Nome<span class="req">*</span></label><input id="un-nome" placeholder="nome completo"></div>
        <div class="full"><label>E-mail<span class="req">*</span></label><input id="un-email" type="email" placeholder="pessoa@phorteaguiar.com.br"></div>
        <div class="full"><label>Senha temporária<span class="req">*</span></label>
          <div class="login-senha"><input id="un-senha" value="${senhaInicial}"><button type="button" id="un-gerar" tabindex="-1">gerar outra</button></div>
        </div>
        <div class="full"><label>Nível de permissão</label><select id="un-papel">
          ${PAPEIS.map(p => `<option value="${p.v}">${p.r}</option>`).join("")}
        </select></div>

        <div class="full" id="un-motorista-bloco" hidden>
          <label class="check-inline" style="margin-bottom:10px">
            <input type="checkbox" id="un-mot-existente"> vincular a um motorista já cadastrado (sem login ainda)
          </label>
          <div id="un-mot-novo-campos" class="form-grid" style="padding:0">
            <div><label>CPF</label><input id="un-mot-cpf" placeholder="000.000.000-00"></div>
            <div><label>RG</label><input id="un-mot-rg"></div>
            <div><label>Telefone</label><input id="un-mot-tel" placeholder="(11) 90000-0000"></div>
            <div><label>CNH</label><input id="un-mot-cnh"></div>
            <div><label>Categoria da CNH</label><input id="un-mot-cnh-cat" placeholder="ex: E"></div>
            <div><label>Validade da CNH</label><input type="date" id="un-mot-cnh-val"></div>
          </div>
          <div id="un-mot-existente-campo" class="form-grid" style="padding:0" hidden>
            <div class="full"><label>Motorista</label>${selectMotorista("un-motorista", null)}</div>
          </div>
        </div>

        <div class="full form-note"><span class="req">*</span> campo obrigatório · anote e entregue essas credenciais — a senha não pode ser recuperada depois daqui.</div>
      </div>`,
      rodape: `
        <button class="btn" id="un-cancel">Cancelar</button>
        <button class="btn btn-primary" id="un-save">Criar acesso</button>`,
    });

    const blocoMotorista = document.getElementById("un-motorista-bloco");
    const camposNovo = document.getElementById("un-mot-novo-campos");
    const campoExistente = document.getElementById("un-mot-existente-campo");
    const chkExistente = document.getElementById("un-mot-existente");

    document.getElementById("un-papel").onchange = (e) => {
      blocoMotorista.hidden = e.target.value !== "motorista";
    };
    chkExistente.onchange = () => {
      camposNovo.hidden = chkExistente.checked;
      campoExistente.hidden = !chkExistente.checked;
    };

    document.getElementById("un-gerar").onclick = () => { document.getElementById("un-senha").value = U.gerarSenha(); };
    document.getElementById("un-cancel").onclick = U.closeDrawer;
    document.getElementById("un-save").onclick = async () => {
      const nome = document.getElementById("un-nome").value.trim();
      const email = document.getElementById("un-email").value.trim();
      const senha = document.getElementById("un-senha").value;
      const papel = document.getElementById("un-papel").value;
      if (!nome || !email || senha.length < 8) { U.toast("Preencha nome, e-mail e uma senha com pelo menos 8 caracteres."); return; }

      const dados = { email, senha, nome, papel };
      if (papel === "motorista") {
        if (chkExistente.checked) {
          const motoristaId = document.getElementById("un-motorista").value;
          if (!motoristaId) { U.toast("Escolha um motorista já cadastrado, ou desmarque a opção pra cadastrar um novo."); return; }
          dados.motorista_id = motoristaId;
        } else {
          dados.novo_motorista = {
            cpf: document.getElementById("un-mot-cpf").value.trim() || null,
            rg: document.getElementById("un-mot-rg").value.trim() || null,
            telefone: document.getElementById("un-mot-tel").value.trim() || null,
            cnh: document.getElementById("un-mot-cnh").value.trim() || null,
            cnh_categoria: document.getElementById("un-mot-cnh-cat").value.trim() || null,
            cnh_validade: document.getElementById("un-mot-cnh-val").value || null,
          };
        }
      }

      const btn = document.getElementById("un-save");
      btn.disabled = true; btn.textContent = "Criando…";
      try {
        await LIVE.criarUsuario(dados);
        U.closeDrawer();
        U.toast("Acesso criado: " + email);
        recarregar();
      } catch (e) {
        U.toast("Erro ao criar: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Criar acesso";
      }
    };
  }

  /* --------------------------------------------------------------- editar */
  function formEditar(u) {
    U.openDrawer({
      titulo: "Editar acesso",
      sub: U.esc(u.email),
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Nome</label><input id="ue-nome" value="${U.esc(u.nome || "")}"></div>
        <div><label>Nível de permissão</label><select id="ue-papel">
          ${PAPEIS.map(p => `<option value="${p.v}" ${p.v === u.papel ? "selected" : ""}>${p.r}</option>`).join("")}
        </select></div>
        <div><label>Vincular a motorista (opcional)</label>${selectMotorista("ue-motorista", u.motorista_id)}</div>
        <div class="full"><label>Telefone</label><input id="ue-telefone" value="${U.esc(u.telefone || "")}"></div>
      </div>`,
      rodape: `
        <button class="btn" id="ue-cancel">Cancelar</button>
        <button class="btn btn-primary" id="ue-save">Salvar alterações</button>`,
    });
    document.getElementById("ue-cancel").onclick = U.closeDrawer;
    document.getElementById("ue-save").onclick = async () => {
      const btn = document.getElementById("ue-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        await LIVE.atualizarUsuario(u.user_id, {
          nome: document.getElementById("ue-nome").value.trim(),
          papel: document.getElementById("ue-papel").value,
          motorista_id: document.getElementById("ue-motorista").value || null,
          telefone: document.getElementById("ue-telefone").value.trim(),
        });
        U.closeDrawer();
        U.toast("Acesso atualizado.");
        recarregar();
      } catch (e) {
        U.toast("Erro ao salvar: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Salvar alterações";
      }
    };
  }

  /* --------------------------------------------------------- resetar senha */
  function formResetarSenha(u) {
    const senhaInicial = U.gerarSenha();
    U.openDrawer({
      titulo: "Resetar senha",
      sub: U.esc(u.email),
      corpo: `
      <div class="form-grid">
        <div class="full"><label>Nova senha<span class="req">*</span></label>
          <div class="login-senha"><input id="urs-senha" value="${senhaInicial}"><button type="button" id="urs-gerar" tabindex="-1">gerar outra</button></div>
        </div>
        <div class="full form-note">Anote e entregue a nova senha — ela substitui a anterior imediatamente.</div>
      </div>`,
      rodape: `
        <button class="btn" id="urs-cancel">Cancelar</button>
        <button class="btn btn-primary" id="urs-save">Resetar senha</button>`,
    });
    document.getElementById("urs-gerar").onclick = () => { document.getElementById("urs-senha").value = U.gerarSenha(); };
    document.getElementById("urs-cancel").onclick = U.closeDrawer;
    document.getElementById("urs-save").onclick = async () => {
      const senha = document.getElementById("urs-senha").value;
      if (senha.length < 8) { U.toast("A senha precisa ter pelo menos 8 caracteres."); return; }
      const btn = document.getElementById("urs-save");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        await LIVE.resetarSenhaUsuario(u.user_id, senha);
        U.closeDrawer();
        U.toast("Senha redefinida.");
      } catch (e) {
        U.toast("Erro: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Resetar senha";
      }
    };
  }

  /* ------------------------------------------------------ ativar/desativar */
  async function alternarAtivo(u) {
    try {
      await LIVE.atualizarUsuario(u.user_id, { ativo: u.ativo === false });
      U.toast(u.ativo === false ? "Acesso reativado." : "Acesso desativado.");
      recarregar();
    } catch (e) {
      U.toast("Erro: " + (e.message || e));
    }
  }

  /* -------------------------------------------------------------- excluir */
  function confirmarExclusao(u) {
    U.openModal(`
      <h3>Excluir acesso de ${U.esc(u.nome || u.email)}?</h3>
      <p class="modal-sub">O login (${U.esc(u.email)}) deixa de funcionar. Se houver histórico vinculado a esta conta, ela é desativada em vez de excluída fisicamente — nunca fica travado.</p>
      <div class="mt" style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" id="ux-cancel">Cancelar</button>
        <button class="btn btn-danger" id="ux-confirmar">Excluir</button>
      </div>`);
    document.getElementById("ux-cancel").onclick = U.closeModal;
    document.getElementById("ux-confirmar").onclick = async () => {
      const btn = document.getElementById("ux-confirmar");
      btn.disabled = true; btn.textContent = "Excluindo…";
      try {
        const r = await LIVE.excluirUsuario(u.user_id);
        U.closeModal();
        U.toast(r.modo === "excluido" ? "Acesso excluído." : "Havia histórico vinculado — o acesso foi desativado em vez de excluído.");
        recarregar();
      } catch (e) {
        U.toast("Erro ao excluir: " + (e.message || e));
        btn.disabled = false; btn.textContent = "Excluir";
      }
    };
  }

  /* ---------------------------------------------------------------- carga */
  async function recarregar() {
    try {
      const [usuarios, motoristas, sessao] = await Promise.all([
        LIVE.listarUsuarios(), LIVE.todosMotoristas(), window.sb.auth.getSession(),
      ]);
      state.usuarios = usuarios.sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email));
      state.motoristas = motoristas;
      state.meuUserId = sessao.data.session?.user?.id || null;
      state.erro = null;
    } catch (e) {
      state.usuarios = [];
      const msg = (e.message || String(e)).toLowerCase();
      state.erro = msg.includes("permission") || msg.includes("administrador")
        ? "Acesso restrito a administradores."
        : "Não foi possível carregar os usuários: " + (e.message || e);
    }
    tabela();
  }

  function bind() {
    document.getElementById("btn-novo-usuario").addEventListener("click", formNovo);
    recarregar().then(() => { document.getElementById("btn-novo-usuario").disabled = false; });
  }

  window.VIEWS = window.VIEWS || {};
  window.VIEWS.usuarios = {
    title: "Usuários e acessos",
    sub: "Cria, edita, reseta senha e desativa acessos de qualquer papel",
    render: view, bind,
  };
})();
