/* ============================================================================
   TABELA DE COEFICIENTES DA ANTT — piso mínimo de frete (Lei 13.703/2018)

   Resolução ANTT nº 6.084, de 16 de julho de 2026 (em vigor desde a publicação,
   substituiu a 6.076 de 19/01/2026).

   COMO ATUALIZAR (a ANTT revisa ~2x por ano):
     1. Abrir a resolução nova em https://anttlegis.antt.gov.br/
     2. Copiar os coeficientes do anexo da Tabela A para o objeto abaixo
     3. Trocar RESOLUCAO/PUBLICADA_EM
     4. Conferir 2 ou 3 valores em https://calculadorafrete.antt.gov.br/
     5. Commit + push — o site republica sozinho

   CONFERÊNCIA DESTA TABELA:
   Os quatro extremos batem exatamente com o que a ANTT divulgou no anúncio da
   6.084 (carga geral: CCD de 3,9826 a 9,2027 e CC de 451,84 a 903,32;
   frigorificada: CC de 520,07 a 1.067,06). Os valores intermediários vieram de
   fonte secundária e NÃO foram conferidos um a um no anexo oficial.
   ============================================================================ */
(function () {
  const RESOLUCAO = "6.084";
  const PUBLICADA_EM = "2026-07-16";

  /* tipos de carga na nomenclatura da própria ANTT */
  const TIPOS = [
    { v: "carga_geral",    r: "Carga geral" },
    { v: "granel_solido",  r: "Granel sólido" },
    { v: "frigorificada",  r: "Frigorificada ou aquecida" },
    { v: "granel_liquido", r: "Granel líquido" },
    { v: "conteinerizada", r: "Conteinerizada" },
    { v: "neogranel",      r: "Neogranel" },
    { v: "perigosa",       r: "Carga perigosa" },
    { v: "carga_viva",     r: "Carga viva" },
  ];

  /* Tabela A — carga lotação, composição completa (cavalo + carreta do
     transportador). É a que se aplica à operação da Phorte Aguiar.
     Estrutura: tipo -> nº de eixos -> { ccd (R$/km), cc (R$) }
     Combinação ausente = não transcrita ainda; a tela avisa e manda para
     a calculadora oficial em vez de chutar um valor. */
  const A = {
    carga_geral: {
      2: { ccd: 3.9826, cc: 451.84 },
      3: { ccd: 5.0977, cc: 541.86 },
      4: { ccd: 5.7822, cc: 588.86 },
      5: { ccd: 6.6718, cc: 657.56 },
      6: { ccd: 7.3547, cc: 671.93 },
      7: { ccd: 8.0927, cc: 831.66 },
      9: { ccd: 9.2027, cc: 903.32 },
    },
    granel_solido: {
      2: { ccd: 4.0144, cc: 460.59 },
      7: { ccd: 8.0516, cc: 820.34 },
      9: { ccd: 9.2231, cc: 908.91 },
    },
    frigorificada: {
      2: { ccd: 4.7095, cc: 520.07 },
      9: { ccd: 10.8870, cc: 1067.06 },
    },
  };

  const EIXOS = [2, 3, 4, 5, 6, 7, 8, 9];

  window.ANTT = {
    RESOLUCAO,
    PUBLICADA_EM,
    TIPOS,
    EIXOS,
    FONTE_OFICIAL: "https://calculadorafrete.antt.gov.br/",

    /* devolve {ccd, cc} ou null se a combinação ainda não foi transcrita */
    coeficientes(tipo, eixos) {
      const porTipo = A[tipo];
      if (!porTipo) return null;
      return porTipo[eixos] || null;
    },

    /* piso = (distância × CCD) + CC */
    calcular(tipo, eixos, distanciaKm) {
      const c = this.coeficientes(tipo, eixos);
      if (!c || !(distanciaKm > 0)) return null;
      const deslocamento = distanciaKm * c.ccd;
      return {
        ccd: c.ccd,
        cc: c.cc,
        deslocamento,
        piso: deslocamento + c.cc,
      };
    },

    rotuloTipo(v) {
      const t = TIPOS.find(x => x.v === v);
      return t ? t.r : v;
    },
  };
})();
