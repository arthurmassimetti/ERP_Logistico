/* Camada de dados vivos — fala direto com o Supabase (window.sb, criado em auth.js).
   Todas as telas usam LIVE.* — não existe mais dado estático (data.js foi removido). */
(function () {
  const LIVE = {};

  let cacheMotoristas = null;
  let cacheVeiculos = null;

  LIVE.motoristas = async function (forcar) {
    if (cacheMotoristas && !forcar) return cacheMotoristas;
    const { data, error } = await window.sb
      .from("motoristas")
      .select("id,nome,ativo")
      .eq("ativo", true)
      .order("nome");
    if (error) throw error;
    cacheMotoristas = data;
    return data;
  };

  LIVE.veiculos = async function (forcar) {
    if (cacheVeiculos && !forcar) return cacheVeiculos;
    const { data, error } = await window.sb
      .from("veiculos")
      .select("placa,tipo,motorista_id,situacao,situacao_motivo")
      .eq("ativo", true)
      .order("placa");
    if (error) throw error;
    cacheVeiculos = data;
    return data;
  };

  /* frota completa (cavalos + carretas, tipo diferencia) — usado na tela Frota e nos alertas de óleo/tacógrafo/consumo */
  LIVE.frota = async function () {
    const { data, error } = await window.sb
      .from("veiculos")
      .select("*, motoristas(nome)")
      .eq("ativo", true)
      .order("tipo")
      .order("placa");
    if (error) throw error;
    return data;
  };

  /* vales em aberto de todos os motoristas (saldo > 0) — usado no motor de alertas */
  LIVE.vales = async function () {
    const { data, error } = await window.sb
      .from("vales")
      .select("*, motoristas(nome)")
      .gt("saldo", 0)
      .order("data", { ascending: false });
    if (error) throw error;
    return data;
  };

  const SELECT_FRETE = "*, motoristas(nome), veiculos(placa), categorias_carga(nome)";

  LIVE.fretes = async function () {
    const { data, error } = await window.sb
      .from("fretes")
      .select(SELECT_FRETE)
      .order("data", { ascending: false });
    if (error) throw error;
    return data;
  };

  LIVE.criarFrete = async function (dados) {
    const { data, error } = await window.sb
      .from("fretes")
      .insert(dados)
      .select(SELECT_FRETE)
      .single();
    if (error) throw error;
    return data;
  };

  LIVE.atualizarFrete = async function (id, dados) {
    const { data, error } = await window.sb
      .from("fretes")
      .update(dados)
      .eq("id", id)
      .select(SELECT_FRETE)
      .single();
    if (error) throw error;
    return data;
  };

  /* busca 1 frete com os mesmos joins de sempre — usado pra reidratar uma linha
     quando chega um evento de realtime (patch_012_kanban_status_frete.sql) */
  LIVE.fretePorId = async function (id) {
    const { data, error } = await window.sb
      .from("fretes")
      .select(SELECT_FRETE)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  };

  /* histórico de troca de status_entrega (kanban) — gravado por trigger, só leitura */
  LIVE.historicoStatusFrete = async function (freteId) {
    const { data, error } = await window.sb
      .from("fretes_status_historico")
      .select("*")
      .eq("frete_id", freteId)
      .order("alterado_em");
    if (error) throw error;
    return data;
  };

  /* categorias de carga (lookup) — usado no form de fretes: só as ativas */
  LIVE.categoriasCarga = async function () {
    const { data, error } = await window.sb
      .from("categorias_carga")
      .select("*")
      .eq("ativa", true)
      .order("nome");
    if (error) throw error;
    return data;
  };

  /* tela de gestão de categorias: ativas + inativas, pra poder reativar */
  LIVE.todasCategoriasCarga = async function () {
    const { data, error } = await window.sb.from("categorias_carga").select("*").order("nome");
    if (error) throw error;
    return data;
  };

  LIVE.criarCategoriaCarga = async function (dados) {
    const { data, error } = await window.sb.from("categorias_carga").insert(dados).select().single();
    if (error) throw error;
    return data;
  };

  LIVE.atualizarCategoriaCarga = async function (id, dados) {
    const { data, error } = await window.sb.from("categorias_carga").update(dados).eq("id", id).select().single();
    if (error) throw error;
    return data;
  };

  /* clientes: ativos (dropdown do formulário de frete) e todos (tela de cadastro) */
  LIVE.clientes = async function () {
    const { data, error } = await window.sb.from("clientes").select("*").eq("ativo", true).order("nome");
    if (error) throw error;
    return data;
  };

  LIVE.todosClientes = async function () {
    const { data, error } = await window.sb.from("clientes").select("*").order("nome");
    if (error) throw error;
    return data;
  };

  LIVE.criarCliente = async function (dados) {
    const { data, error } = await window.sb.from("clientes").insert(dados).select().single();
    if (error) throw error;
    return data;
  };

  LIVE.atualizarCliente = async function (id, dados) {
    const { data, error } = await window.sb.from("clientes").update(dados).eq("id", id).select().single();
    if (error) throw error;
    return data;
  };

  /* empresa: linha única (id=1) com os dados cadastrais — só admin lê/edita (RLS) */
  LIVE.empresa = async function () {
    const { data, error } = await window.sb.from("empresa").select("*").eq("id", 1).single();
    if (error) throw error;
    return data;
  };

  LIVE.atualizarEmpresa = async function (dados) {
    const { data, error } = await window.sb.from("empresa").update(dados).eq("id", 1).select().single();
    if (error) throw error;
    return data;
  };

  /* roteiro: busca uma janela de dias (padrão: de 3 dias atrás até 14 dias à frente) */
  LIVE.roteiro = async function (deISO, ateISO) {
    let q = window.sb.from("roteiro").select("*, motoristas(nome)").order("data");
    if (deISO) q = q.gte("data", deISO);
    if (ateISO) q = q.lte("data", ateISO);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  };

  LIVE.criarRoteiro = async function (dados) {
    const { data, error } = await window.sb
      .from("roteiro").insert(dados).select("*, motoristas(nome)").single();
    if (error) throw error;
    return data;
  };

  LIVE.atualizarRoteiro = async function (id, dados) {
    const { data, error } = await window.sb
      .from("roteiro").update(dados).eq("id", id).select("*, motoristas(nome)").single();
    if (error) throw error;
    return data;
  };

  /* motoristas — tela de gestão (ativos e inativos, com veículo e login vinculados) */
  LIVE.todosMotoristas = async function () {
    const { data, error } = await window.sb
      .from("motoristas")
      .select("*, veiculos(placa), perfis(user_id,papel)")
      .order("nome");
    if (error) throw error;
    return data;
  };

  LIVE.motoristaPorId = async function (id) {
    const { data, error } = await window.sb
      .from("motoristas").select("*, veiculos(placa), perfis(user_id,papel)").eq("id", id).single();
    if (error) throw error;
    return data;
  };

  LIVE.atualizarMotorista = async function (id, dados) {
    const { data, error } = await window.sb.from("motoristas").update(dados).eq("id", id).select().single();
    if (error) throw error;
    return data;
  };

  LIVE.fretesPorMotorista = async function (motoristaId) {
    const { data, error } = await window.sb
      .from("fretes").select("*, veiculos(placa)")
      .eq("motorista_id", motoristaId).order("data", { ascending: false });
    if (error) throw error;
    return data;
  };

  LIVE.valesPorMotorista = async function (motoristaId) {
    const { data, error } = await window.sb
      .from("vales").select("*").eq("motorista_id", motoristaId).order("data", { ascending: false });
    if (error) throw error;
    return data;
  };

  LIVE.criarVale = async function (dados) {
    const { data, error } = await window.sb.from("vales").insert(dados).select().single();
    if (error) throw error;
    return data;
  };

  /* portal do motorista: RLS já garante que só vêm as linhas do próprio motorista logado */
  LIVE.meusFretes = async function (limite) {
    const { data, error } = await window.sb
      .from("vw_fretes_motorista").select("*").order("data", { ascending: false }).limit(limite || 30);
    if (error) throw error;
    return data;
  };

  LIVE.meusVales = async function () {
    const { data, error } = await window.sb.from("vales").select("*").order("data", { ascending: false });
    if (error) throw error;
    return data;
  };

  /* primeiro acesso do motorista — a RPC resolve o motorista_id sozinha a partir de quem está logado */
  LIVE.concluirPrimeiroAcesso = async function (dados) {
    const { data, error } = await window.sb.rpc("concluir_primeiro_acesso", {
      p_telefone: dados.telefone,
      p_cnh: dados.cnh,
      p_cnh_categoria: dados.cnh_categoria,
      p_cnh_validade: dados.cnh_validade,
      p_endereco: dados.endereco,
      p_cidade: dados.cidade,
      p_uf: dados.uf,
      p_cep: dados.cep,
      p_contato_emergencia_nome: dados.contato_emergencia_nome,
      p_contato_emergencia_telefone: dados.contato_emergencia_telefone,
      p_nome: dados.nome ?? null,
      p_data_nascimento: dados.data_nascimento || null,
      p_rg: dados.rg ?? null,
    });
    if (error) throw error;
    return data;
  };

  /* tour guiado — "concluido" (terminou/pediu pra ver de novo) ou "cancelado" (pulou) */
  LIVE.registrarTourMotorista = async function (status) {
    const { error } = await window.sb.rpc("registrar_tour_motorista", { p_status: status });
    if (error) throw error;
  };

  /* gestão de usuários via Edge Function (precisa da chave secreta, por isso não roda no navegador puro).
     A função foi deployada no Supabase com o nome "dynamic-processor" (nome sugerido pelo dashboard
     na hora do deploy) — o código dela é o de supabase/functions/admin-usuarios/index.ts. */
  async function chamarAdminUsuarios(corpo) {
    const { data, error } = await window.sb.functions.invoke("dynamic-processor", { body: corpo });
    if (error) {
      let msg = error.message || String(error);
      if (error.context && typeof error.context.json === "function") {
        try { const c = await error.context.json(); if (c && c.error) msg = c.error; } catch (_) {}
      }
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  LIVE.criarUsuario = (dados) => chamarAdminUsuarios(dados);
  LIVE.listarUsuarios = async () => (await chamarAdminUsuarios({ acao: "listar" })).usuarios;
  LIVE.atualizarUsuario = (user_id, dados) => chamarAdminUsuarios({ acao: "atualizar", user_id, ...dados });
  LIVE.resetarSenhaUsuario = (user_id, nova_senha) => chamarAdminUsuarios({ acao: "resetar_senha", user_id, nova_senha });
  LIVE.excluirUsuario = (user_id) => chamarAdminUsuarios({ acao: "excluir", user_id });

  /* financeiro: contas a pagar avulsas — cacheado (igual motoristas/veiculos); toda escrita invalida */
  let cacheContasPagar = null;

  LIVE.contasPagar = async function (forcar) {
    if (cacheContasPagar && !forcar) return cacheContasPagar;
    const { data, error } = await window.sb.from("contas_pagar").select("*").order("vencimento");
    if (error) throw error;
    cacheContasPagar = data;
    return data;
  };

  LIVE.criarContaPagar = async function (dados) {
    const { data, error } = await window.sb.from("contas_pagar").insert(dados).select().single();
    if (error) throw error;
    cacheContasPagar = null;
    return data;
  };

  LIVE.atualizarContaPagar = async function (id, dados) {
    const { data, error } = await window.sb.from("contas_pagar").update(dados).eq("id", id).select().single();
    if (error) throw error;
    cacheContasPagar = null;
    return data;
  };

  /* financeiro: contas fixas mensais (RLS já entrega só empresa pro papel financeiro; admin vê tudo) — cacheado */
  let cacheContasFixas = null;

  LIVE.contasFixas = async function (forcar) {
    if (cacheContasFixas && !forcar) return cacheContasFixas;
    const { data, error } = await window.sb.from("contas_fixas").select("*").order("dia_venc");
    if (error) throw error;
    cacheContasFixas = data;
    return data;
  };

  LIVE.criarContaFixa = async function (dados) {
    const { data, error } = await window.sb.from("contas_fixas").insert(dados).select().single();
    if (error) throw error;
    cacheContasFixas = null;
    return data;
  };

  LIVE.atualizarContaFixa = async function (id, dados) {
    const { data, error } = await window.sb.from("contas_fixas").update(dados).eq("id", id).select().single();
    if (error) throw error;
    cacheContasFixas = null;
    return data;
  };

  /* financeiro: saldo por conta bancária (número único, atualizado à mão) */
  LIVE.saldosBanco = async function () {
    const { data, error } = await window.sb.from("saldos_banco").select("*").order("banco");
    if (error) throw error;
    return data;
  };

  LIVE.atualizarSaldoBanco = async function (id, saldo) {
    const { data, error } = await window.sb.from("saldos_banco")
      .update({ saldo, atualizado_em: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  };

  /* financeiro: contas a receber = view automática a partir do saldo pendente de cada frete */
  LIVE.contasReceber = async function () {
    const { data, error } = await window.sb
      .from("vw_contas_receber").select("*")
      .order("pagamento_previsto", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data;
  };

  /* fretes recebidos dentro de um mês (para o KPI "recebido no mês" de Contas a Receber) */
  LIVE.recebidosNoMes = async function (mesISO) {
    const [y, m] = mesISO.split("-").map(Number);
    const de = `${mesISO}-01`;
    const proxY = m === 12 ? y + 1 : y, proxM = m === 12 ? 1 : m + 1;
    const ate = `${proxY}-${String(proxM).padStart(2, "0")}-01`;
    const { data, error } = await window.sb
      .from("fretes").select("id,transportadora,valor_frete,adiantamento,saldo,pagamento_realizado")
      .gte("pagamento_realizado", de).lt("pagamento_realizado", ate);
    if (error) throw error;
    return data;
  };

  /* confirma recebimento (total ou parcial) direto da tela de Contas a Receber — via RPC porque o
     papel financeiro só tem leitura na tabela fretes; a função só mexe em adiantamento/saldo/pagamento_realizado
     (patch_005_recebimento_financeiro.sql precisa estar rodado no Supabase) */
  LIVE.registrarRecebimentoFrete = async function (freteId, dados) {
    const { data, error } = await window.sb.rpc("registrar_recebimento_frete", {
      p_frete_id: freteId,
      p_adiantamento: dados.adiantamento ?? null,
      p_saldo: dados.saldo ?? null,
      p_pagamento_realizado: dados.pagamento_realizado ?? null,
    });
    if (error) throw error;
    return data;
  };

  /* vencimentos: contas fixas expandidas por mês + avulsas em aberto, dentro do horizonte (dias) */
  LIVE.vencimentos = async function (horizonte) {
    const { data, error } = await window.sb.rpc("gerar_vencimentos", { horizonte: horizonte || 45 });
    if (error) throw error;
    return data;
  };

  /* frota: situação operacional do veículo (disponível/em_manutencao/bloqueado/inativo).
     situacao_em/situacao_por são gravados por trigger no banco — nunca enviados pelo cliente. */
  LIVE.atualizarSituacaoVeiculo = async function (placa, dados) {
    const { data, error } = await window.sb.from("veiculos").update(dados).eq("placa", placa).select().single();
    if (error) throw error;
    return data;
  };

  /* frota: cadastro de veículo (placa não muda depois de criado — é a chave primária) */
  LIVE.criarVeiculo = async function (dados) {
    const { data, error } = await window.sb.from("veiculos").insert(dados).select().single();
    if (error) throw error;
    return data;
  };

  LIVE.atualizarVeiculo = async function (placa, dados) {
    const { data, error } = await window.sb.from("veiculos").update(dados).eq("placa", placa).select().single();
    if (error) throw error;
    return data;
  };

  /* libera qualquer veículo que hoje aponte pra este motorista — usado antes de
     atribuir um novo, pra nunca deixar um motorista com 2 veículos ao mesmo tempo
     (patch_010: unique(motorista_id) também garante isso no banco) */
  LIVE.liberarVeiculosDoMotorista = async function (motoristaId) {
    const { error } = await window.sb.from("veiculos").update({ motorista_id: null }).eq("motorista_id", motoristaId);
    if (error) throw error;
  };

  /* troca de vínculo pelo lado do motorista (tela Motoristas): libera de onde ele
     estiver, libera quem estiver no veículo escolhido, e então atribui. novaPlaca
     null = só deixa o motorista sem veículo. */
  LIVE.atribuirVeiculoAoMotorista = async function (motoristaId, novaPlaca) {
    await LIVE.liberarVeiculosDoMotorista(motoristaId);
    if (!novaPlaca) return null;
    const { error: eLivrar } = await window.sb.from("veiculos").update({ motorista_id: null }).eq("placa", novaPlaca);
    if (eLivrar) throw eLivrar;
    const { data, error } = await window.sb.from("veiculos").update({ motorista_id: motoristaId }).eq("placa", novaPlaca).select().single();
    if (error) throw error;
    return data;
  };

  /* troca de vínculo pelo lado da carreta: qual cavalo passa a puxá-la. O campo
     carreta_placa mora no CAVALO, não na carreta — então "atribuir" aqui é
     liberar quem já puxa essa carreta e gravar no cavalo escolhido (que também
     larga, na mesma escrita, qualquer outra carreta que ele tivesse antes).
     novoCavaloPlaca null = a carreta fica sem cavalo (reserva). */
  LIVE.atribuirCarretaAoCavalo = async function (carretaPlaca, novoCavaloPlaca) {
    const { error: eLivrar } = await window.sb.from("veiculos").update({ carreta_placa: null }).eq("carreta_placa", carretaPlaca);
    if (eLivrar) throw eLivrar;
    if (!novoCavaloPlaca) return null;
    const { data, error } = await window.sb.from("veiculos").update({ carreta_placa: carretaPlaca }).eq("placa", novoCavaloPlaca).select().single();
    if (error) throw error;
    return data;
  };

  /* frota: registra troca de óleo — reseta km_troca (+intervalo do veículo), conta a troca e,
     se pedido, quita o filtro de ar junto. Tudo via RPC transacional (patch_013). */
  LIVE.registrarTrocaOleo = async function (placa, dados) {
    const { data, error } = await window.sb.rpc("registrar_troca_oleo", {
      p_placa: placa,
      p_km_atual: dados.km_atual,
      p_data: dados.data || null,
      p_oficina: dados.oficina ?? null,
      p_valor_oleo: dados.valor_oleo ?? null,
      p_trocar_filtro_ar: !!dados.trocar_filtro_ar,
      p_valor_filtro_ar: dados.valor_filtro_ar ?? null,
    });
    if (error) throw error;
    return data;
  };

  /* frota: renova o tacógrafo (nova validade) e opcionalmente registra o custo (patch_013) */
  LIVE.registrarRenovacaoTacografo = async function (placa, dados) {
    const { data, error } = await window.sb.rpc("registrar_renovacao_tacografo", {
      p_placa: placa,
      p_nova_validade: dados.nova_validade,
      p_observacao: dados.observacao ?? null,
      p_data: dados.data || null,
      p_oficina: dados.oficina ?? null,
      p_valor: dados.valor ?? null,
    });
    if (error) throw error;
    return data;
  };

  /* manutenção: ordens de manutenção (fluxo de trabalho) — histórico de custo continua em "manutencoes" */
  const SELECT_ORDEM = "*, veiculos(placa,tipo,situacao)";

  LIVE.ordensManutencao = async function () {
    const { data, error } = await window.sb
      .from("ordens_manutencao").select(SELECT_ORDEM).order("aberta_em", { ascending: false });
    if (error) throw error;
    return data;
  };

  LIVE.criarOrdemManutencao = async function (dados) {
    const { data, error } = await window.sb
      .from("ordens_manutencao").insert(dados).select(SELECT_ORDEM).single();
    if (error) throw error;
    return data;
  };

  LIVE.atualizarOrdemManutencao = async function (id, dados) {
    const { data, error } = await window.sb
      .from("ordens_manutencao").update(dados).eq("id", id).select(SELECT_ORDEM).single();
    if (error) throw error;
    return data;
  };

  /* concluir ordem: transacional (rpc) — fecha a ordem, gera o custo em manutencoes,
     e libera o veículo se pedido. patch_008_seguranca_motoristas_frota_manutencao.sql */
  LIVE.concluirOrdemManutencao = async function (ordemId, dados) {
    const { data, error } = await window.sb.rpc("concluir_ordem_manutencao", {
      p_ordem_id: ordemId,
      p_servico_realizado: dados.servico_realizado,
      p_valor_pecas: dados.valor_pecas ?? null,
      p_valor_mao_obra: dados.valor_mao_obra ?? null,
      p_liberar_veiculo: !!dados.liberar_veiculo,
    });
    if (error) throw error;
    return data;
  };

  /* histórico de manutenções (livro-caixa, já existia no banco antes de ter tela) */
  LIVE.historicoManutencoes = async function () {
    const { data, error } = await window.sb.from("manutencoes").select("*").order("data", { ascending: false });
    if (error) throw error;
    return data;
  };

  /* portal do motorista: veículo vinculado (RLS já garante que só vem o próprio, se existir) */
  LIVE.meuVeiculo = async function () {
    const { data, error } = await window.sb.from("veiculos").select("*").limit(1).maybeSingle();
    if (error) throw error;
    return data;
  };

  /* portal do motorista: checklist já enviado hoje pra este veículo (null se ainda não enviou) */
  LIVE.meuChecklistHoje = async function (veiculoPlaca) {
    const { data, error } = await window.sb
      .from("checklists").select("*")
      .eq("veiculo_placa", veiculoPlaca).eq("data", window.U.hojeISO())
      .order("criado_em", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  };

  LIVE.criarChecklist = async function (dados) {
    const { data, error } = await window.sb.from("checklists").insert(dados).select().single();
    if (error) throw error;
    return data;
  };

  /* portal do motorista: relato de problema (ocorrência) — insert-only, RLS garante que só cria o próprio */
  LIVE.criarOcorrencia = async function (dados) {
    const { data, error } = await window.sb.from("ocorrencias").insert(dados).select().single();
    if (error) throw error;
    return data;
  };

  LIVE.minhasOcorrencias = async function () {
    const { data, error } = await window.sb.from("ocorrencias").select("*").order("criado_em", { ascending: false });
    if (error) throw error;
    return data;
  };

  /* admin: fila de ocorrências relatadas pelos motoristas */
  LIVE.ocorrencias = async function () {
    const { data, error } = await window.sb
      .from("ocorrencias").select("*, motoristas(nome), veiculos(placa,tipo), roteiro(data,destino_local,destino_cidade,destino_uf)")
      .order("criado_em", { ascending: false });
    if (error) throw error;
    return data;
  };

  LIVE.atualizarOcorrencia = async function (id, dados) {
    const { data, error } = await window.sb.from("ocorrencias").update(dados).eq("id", id).select().single();
    if (error) throw error;
    return data;
  };

  /* admin: buscar uma ocorrência específica (usado ao abrir ordem a partir dela, via #/manutencoes?ocorrencia=) */
  LIVE.ocorrenciaPorId = async function (id) {
    const { data, error } = await window.sb
      .from("ocorrencias").select("*, motoristas(nome), veiculos(placa,tipo)").eq("id", id).single();
    if (error) throw error;
    return data;
  };

  window.LIVE = LIVE;
})();
