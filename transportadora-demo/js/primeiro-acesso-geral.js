/* Primeiro acesso obrigatório pra quem NÃO é motorista (admin/operacional/financeiro).
   Motorista tem o próprio fluxo em motorista-app.js (ganha também CNH, que não existe pra
   ninguém aqui). Os dois usam a mesma RPC concluir_primeiro_acesso (patch_017) — o banco
   decide sozinho onde gravar, pelo papel de quem está logado, nunca por parâmetro solto.
   Chamado por auth.js, que já garante window.U/window.LIVE carregados antes de chamar isto. */
(function () {
  function camposComuns(p) {
    const U = window.U;
    const g = (c) => (p && p[c]) || "";
    return `
      <div class="full"><label>Nome completo<span class="req">*</span></label><input id="ga-nome" value="${U.esc(g("nome"))}"></div>
      <div><label>CPF${!g("cpf") ? '<span class="req">*</span>' : ""}</label>
        ${g("cpf")
          ? `<input value="${U.esc(U.formatarCPF(g("cpf")))}" disabled>`
          : `<input id="ga-cpf" placeholder="000.000.000-00" inputmode="numeric">`}
      </div>
      <div><label>Data de nascimento</label><input type="date" id="ga-nascimento" value="${g("data_nascimento")}"></div>
      <div><label>Telefone<span class="req">*</span></label><input id="ga-telefone" value="${U.esc(g("telefone"))}" placeholder="(11) 90000-0000"></div>
      <div class="full"><label>Endereço<span class="req">*</span></label><input id="ga-endereco" value="${U.esc(g("endereco"))}" placeholder="rua, número, bairro"></div>
      <div><label>Cidade</label><input id="ga-cidade" value="${U.esc(g("cidade"))}"></div>
      <div><label>UF</label><input id="ga-uf" maxlength="2" style="text-transform:uppercase" value="${U.esc(g("uf"))}"></div>
      <div><label>CEP</label><input id="ga-cep" value="${U.esc(g("cep"))}"></div>
      <div><label>Contato de emergência — nome<span class="req">*</span></label><input id="ga-emerg-nome" value="${U.esc(g("contato_emergencia_nome"))}"></div>
      <div><label>Contato de emergência — telefone<span class="req">*</span></label><input id="ga-emerg-tel" value="${U.esc(g("contato_emergencia_telefone"))}"></div>
      <div id="ga-erro" class="full form-note" style="color:var(--danger)" hidden></div>`;
  }

  /* devolve o registro salvo, ou null se a validação falhou (erro já mostrado na tela) */
  async function salvar() {
    const U = window.U;
    const val = id => document.getElementById(id).value.trim();
    const campoCpf = document.getElementById("ga-cpf"); // só existe se ainda não tinha CPF
    const payload = {
      nome: val("ga-nome") || null,
      data_nascimento: document.getElementById("ga-nascimento").value || null,
      telefone: val("ga-telefone"),
      endereco: val("ga-endereco"),
      cidade: val("ga-cidade") || null,
      uf: val("ga-uf").toUpperCase() || null,
      cep: val("ga-cep") || null,
      contato_emergencia_nome: val("ga-emerg-nome"),
      contato_emergencia_telefone: val("ga-emerg-tel"),
    };
    if (campoCpf) payload.cpf = campoCpf.value.replace(/\D/g, "");

    const erroBox = document.getElementById("ga-erro");
    const faltando = [];
    if (!payload.nome) faltando.push("nome");
    if (campoCpf && !payload.cpf) faltando.push("CPF");
    if (!payload.telefone) faltando.push("telefone");
    if (!payload.endereco) faltando.push("endereço");
    if (!payload.contato_emergencia_nome) faltando.push("contato de emergência (nome)");
    if (!payload.contato_emergencia_telefone) faltando.push("contato de emergência (telefone)");
    if (faltando.length) {
      erroBox.textContent = "Preencha: " + faltando.join(", ") + ".";
      erroBox.hidden = false;
      return null;
    }
    if (campoCpf && payload.cpf && !U.validarCPF(payload.cpf)) {
      erroBox.textContent = "CPF inválido — confira os números digitados.";
      erroBox.hidden = false;
      return null;
    }
    erroBox.hidden = true;
    return await window.LIVE.concluirPrimeiroAcesso(payload);
  }

  /* opcoes.bloqueante=true: sem X, sem fechar clicando fora (login novo, cadastro pendente —
     decisão do dono). bloqueante=false: drawer normal, fechável (lembrete não bloqueante pros
     3 admins dispensados no patch_017, que ainda não preencheram os dados). */
  window.abrirPrimeiroAcessoGeral = function (perfil, opcoes) {
    const U = window.U;
    const bloqueante = !!(opcoes && opcoes.bloqueante);
    U.openDrawer({
      titulo: "Complete seu cadastro",
      sub: bloqueante
        ? "Antes de continuar, confirme ou preencha seus dados. Isso só aparece uma vez."
        : "Preencha quando puder — não precisa ser agora.",
      corpo: `<div class="form-grid">${camposComuns(perfil)}</div>`,
      rodape: bloqueante
        ? `<button class="btn btn-primary" id="ga-salvar">Confirmar cadastro</button>`
        : `<button class="btn" id="ga-cancelar">Agora não</button><button class="btn btn-primary" id="ga-salvar">Salvar</button>`,
    });
    if (bloqueante) {
      document.getElementById("drawer-x").style.display = "none";
      document.getElementById("drawer-back").onclick = () => U.toast("Complete seu cadastro para continuar.");
    } else {
      document.getElementById("ga-cancelar").onclick = U.closeDrawer;
    }
    document.getElementById("ga-salvar").onclick = async () => {
      const btn = document.getElementById("ga-salvar");
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const resultado = await salvar();
        if (!resultado) { btn.disabled = false; btn.textContent = bloqueante ? "Confirmar cadastro" : "Salvar"; return; }
        U.closeDrawer();
        U.toast("Cadastro salvo.");
        if (opcoes && opcoes.aoConcluir) opcoes.aoConcluir(resultado);
      } catch (e) {
        const erroBox = document.getElementById("ga-erro");
        erroBox.textContent = "Erro ao salvar: " + (e.message || e);
        erroBox.hidden = false;
        btn.disabled = false; btn.textContent = bloqueante ? "Confirmar cadastro" : "Salvar";
      }
    };
  };
})();
