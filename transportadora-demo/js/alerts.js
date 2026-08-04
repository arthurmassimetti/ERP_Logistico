/* Motor de alertas — regras derivadas do banco vivo (Supabase) */
(function () {
  const U = window.U;

  async function build() {
    const A = [];
    const push = (a) => A.push(a);

    const hoje = U.hojeISO();
    /* pra quem não tem acesso ao financeiro (operacional), o RLS já devolveria lista vazia
       nestas três — pedir seria só round-trip jogado fora */
    const veFinanceiro = !window.APP || window.APP.podeVer("painelfinanceiro");
    const vazio = Promise.resolve([]);
    const [contasPagar, contasReceber, veiculos, vales, roteiroJanela] = await Promise.all([
      veFinanceiro ? window.LIVE.contasPagar() : vazio,
      veFinanceiro ? window.LIVE.contasReceber() : vazio,
      window.LIVE.frota(),
      veFinanceiro ? window.LIVE.vales() : vazio,
      window.LIVE.roteiro(hoje, U.addDias(hoje, 14)),
    ]);
    const cavalos = veiculos.filter(v => v.tipo === "cavalo");

    /* ---- contas a pagar: vencidas / hoje / próximas ---- */
    contasPagar.forEach(c => {
      if (c.pago_em) return;
      const d = U.diasAte(c.vencimento);
      if (d === null) return;
      const base = {
        tipo: "Conta a pagar", icone: "cash",
        entidade: c.descricao, prazo: c.vencimento,
        link: "#/financeiro?conta=" + c.id, linkLabel: "ver conta",
      };
      if (d < 0) push({ ...base, prioridade: "alta", titulo: `Conta vencida — ${c.descricao}`, descricao: `${U.money(c.valor)} · venceu em ${U.dBR(c.vencimento)} (${U.prazoLabel(c.vencimento)}) · ${c.forma}` });
      else if (d === 0) push({ ...base, prioridade: "alta", titulo: `Vence hoje — ${c.descricao}`, descricao: `${U.money(c.valor)} · ${c.forma} · categoria ${c.categoria}` });
      else if (d <= 7) push({ ...base, prioridade: "media", titulo: `Vencimento próximo — ${c.descricao}`, descricao: `${U.money(c.valor)} · ${U.dBR(c.vencimento)} (${U.prazoLabel(c.vencimento)}) · ${c.forma}` });
      else if (d <= 15) push({ ...base, prioridade: "baixa", titulo: `A programar — ${c.descricao}`, descricao: `${U.money(c.valor)} · ${U.dBR(c.vencimento)} (${U.prazoLabel(c.vencimento)})` });
    });

    /* ---- recebimentos atrasados (vw_contas_receber: só traz fretes ainda não recebidos) ---- */
    contasReceber.forEach(r => {
      const d = U.diasAte(r.pagamento_previsto);
      if (d !== null && d < 0) {
        push({
          tipo: "A receber", icone: "receive", prioridade: "alta",
          titulo: `Recebimento atrasado — ${r.empresa}`,
          descricao: `${U.money(r.valor_pendente)} previsto para ${U.dBR(r.pagamento_previsto)} (${U.prazoLabel(r.pagamento_previsto)}) · frete de ${U.dBR(r.data)}`,
          entidade: r.empresa, prazo: r.pagamento_previsto,
          link: "#/receber", linkLabel: "ver cobrança",
        });
      }
    });

    /* ---- troca de óleo (só cavalos têm km/óleo) ---- */
    cavalos.forEach(v => {
      if (!v.km_atual || !v.km_troca) return;
      const resta = v.km_troca - v.km_atual;
      const base = { tipo: "Troca de óleo", icone: "oil", entidade: U.placaFmt(v.placa), prazo: null, link: "#/frota?placa=" + v.placa, linkLabel: "ver veículo" };
      if (resta <= 0) push({ ...base, prioridade: "alta", titulo: `Troca de óleo vencida — ${U.placaFmt(v.placa)}`, descricao: `Passou ${U.num(-resta)} km do limite (atual ${U.num(v.km_atual)} km · troca ${U.num(v.km_troca)} km)` });
      else if (resta < 10000) push({ ...base, prioridade: "media", titulo: `Troca de óleo próxima — ${U.placaFmt(v.placa)}`, descricao: `Faltam ${U.num(resta)} km (atual ${U.num(v.km_atual)} km · troca ${U.num(v.km_troca)} km)` });
    });

    /* ---- tacógrafo ---- */
    cavalos.forEach(v => {
      if (!v.tacografo_venc) return;
      const d = U.diasAte(v.tacografo_venc);
      const obs = v.tacografo_obs ? ` · ${v.tacografo_obs}` : "";
      const base = { tipo: "Tacógrafo", icone: "doc", entidade: U.placaFmt(v.placa), prazo: v.tacografo_venc, link: "#/frota?placa=" + v.placa, linkLabel: "ver veículo" };
      if (d < 0) push({ ...base, prioridade: "alta", titulo: `Tacógrafo vencido — ${U.placaFmt(v.placa)}`, descricao: `Venceu em ${U.dBR(v.tacografo_venc)} (${U.prazoLabel(v.tacografo_venc)})${obs}` });
      else if (d === 0) push({ ...base, prioridade: "alta", titulo: `Tacógrafo vence hoje — ${U.placaFmt(v.placa)}`, descricao: `Vencimento ${U.dBR(v.tacografo_venc)}${obs}` });
      else if (d <= 45) push({ ...base, prioridade: "media", titulo: `Tacógrafo a vencer — ${U.placaFmt(v.placa)}`, descricao: `Vence em ${U.dBR(v.tacografo_venc)} (${U.prazoLabel(v.tacografo_venc)})${obs}` });
    });

    /* ---- vales / adiantamentos em aberto (LIVE.vales já filtra saldo > 0) ---- */
    vales.forEach(vl => {
      const nome = vl.motoristas ? vl.motoristas.nome : "—";
      push({
        tipo: "Vale em aberto", icone: "wallet", prioridade: "baixa",
        titulo: `Vale em aberto — ${nome}`,
        descricao: `Vale de ${U.money(vl.valor)} em ${U.dBR(vl.data)} · pago ${U.money(vl.pago)} · saldo a descontar ${U.money(vl.saldo)}`,
        entidade: nome, prazo: null,
        link: "#/motoristas/" + vl.motorista_id, linkLabel: "ver extrato",
      });
    });

    /* ---- veículo bloqueado/em manutenção/inativo com tarefa agendada no roteiro (14 dias) ---- */
    const motoristasComTarefa = new Set(roteiroJanela.map(r => r.motorista_id));
    veiculos.forEach(v => {
      if (!v.situacao || v.situacao === "disponivel") return;
      if (!v.motorista_id || !motoristasComTarefa.has(v.motorista_id)) return;
      const nome = v.motoristas ? v.motoristas.nome : "—";
      push({
        tipo: "Veículo indisponível", icone: "alert", prioridade: "alta",
        titulo: `Tarefa agendada com veículo ${U.situacaoVeiculoInfo(v.situacao).rotulo} — ${nome}`,
        descricao: `${U.placaFmt(v.placa)}${v.situacao_motivo ? " · " + v.situacao_motivo : ""}`,
        entidade: nome, prazo: null,
        link: "#/roteiro", linkLabel: "ver roteiro",
      });
    });

    /* ---- consumo abaixo da média da frota ---- */
    const mf = U.mediaFrota(cavalos);
    cavalos.forEach(v => {
      if (!v.media_kml) return;
      if (v.media_kml < mf * 0.95) {
        const pct = ((v.media_kml / mf) - 1) * 100;
        push({
          tipo: "Consumo", icone: "gauge", prioridade: "baixa",
          titulo: `Consumo abaixo da média — ${U.placaFmt(v.placa)}`,
          descricao: `${U.num(v.media_kml, 3)} km/l vs ${U.num(mf, 3)} da frota (${U.num(pct, 1)}%) · medição ${U.dBR(v.media_data)}`,
          entidade: U.placaFmt(v.placa), prazo: null,
          link: "#/frota?placa=" + v.placa, linkLabel: "ver veículo",
        });
      }
    });

    const ord = { alta: 0, media: 1, baixa: 2 };
    A.sort((a, b) => ord[a.prioridade] - ord[b.prioridade] || String(a.prazo || "9999").localeCompare(String(b.prazo || "9999")));
    return A;
  }

  window.buildAlertas = build;

  window.renderAlertList = function (alertas) {
    if (!alertas.length) return '<div class="empty">Nenhum alerta para os filtros selecionados.</div>';
    return '<div class="alert-list">' + alertas.map(a => `
      <div class="alert-item p-${a.prioridade}">
        <div class="alert-ico">${U.icons[a.icone] || U.icons.alert}</div>
        <div class="alert-body">
          <div class="alert-titulo">${U.esc(a.titulo)}</div>
          <div class="alert-desc">${U.esc(a.descricao)}</div>
          <div class="alert-meta">
            <span>tipo: <b>${U.esc(a.tipo)}</b></span>
            <span>relacionado: <b>${U.esc(a.entidade)}</b></span>
            ${a.prazo ? `<span>prazo: <b>${U.dBR(a.prazo)}</b></span>` : ""}
            <span class="tag tag-${a.prioridade}">${a.prioridade === "media" ? "média" : a.prioridade}</span>
          </div>
        </div>
        <div class="alert-act"><a class="btn btn-sm btn-ghost" href="${a.link}">${U.esc(a.linkLabel)} →</a></div>
      </div>`).join("") + "</div>";
  };
})();
