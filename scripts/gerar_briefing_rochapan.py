"""Gera o PDF 'Análise Comercial e Logística — Grupo Rocha Pan'.

Documento com sumário clicável + marcadores (bookmarks) de PDF, para navegação
rápida antes da reunião na FIPAN 2026. Rodar com: python scripts/gerar_briefing_rochapan.py
"""

import itertools
import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table,
    TableStyle, ListFlowable, ListItem, HRFlowable, PageBreak, KeepTogether,
)
from reportlab.platypus.tableofcontents import TableOfContents

# ---------------------------------------------------------------------------
# Paleta e tipografia (consistente com o one-pager já enviado à Phorte Aguiar)
# ---------------------------------------------------------------------------
INK = colors.HexColor("#201D18")
STEEL_DEEP = colors.HexColor("#2A343D")
STEEL = colors.HexColor("#3E4C58")
WHEAT = colors.HexColor("#B97A24")
WHEAT_DEEP = colors.HexColor("#8F5C18")
CAPTION = colors.HexColor("#6B6558")
TABLE_HEAD_BG = colors.HexColor("#F1DDBB")
TABLE_ROW_ALT = colors.HexColor("#F7F4EC")
RULE = colors.HexColor("#D9D5C9")

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "Analise_Comercial_RochaPan_FIPAN2026.pdf")
DOC_TITLE = "Análise Comercial e Logística — Grupo Rocha Pan"

styles = {
    "CoverTitle": ParagraphStyle("CoverTitle", fontName="Helvetica-Bold", fontSize=25,
                                 leading=30, textColor=STEEL_DEEP, spaceAfter=6),
    "CoverSub": ParagraphStyle("CoverSub", fontName="Helvetica", fontSize=13.5,
                               leading=18, textColor=WHEAT_DEEP, spaceAfter=22),
    "CoverMeta": ParagraphStyle("CoverMeta", fontName="Helvetica", fontSize=10.5,
                                leading=17, textColor=CAPTION),
    "CoverBoxTitle": ParagraphStyle("CoverBoxTitle", fontName="Helvetica-Bold", fontSize=10.5,
                                    leading=14, textColor=STEEL_DEEP),
    "CoverBoxBody": ParagraphStyle("CoverBoxBody", fontName="Helvetica", fontSize=10.5,
                                   leading=15, textColor=INK),
    "SumarioTitle": ParagraphStyle("SumarioTitle", fontName="Helvetica-Bold", fontSize=18,
                                   leading=22, textColor=STEEL_DEEP, spaceAfter=14),
    "TOCHeading1": ParagraphStyle("TOCHeading1", fontName="Helvetica-Bold", fontSize=11.3,
                                  leading=18, leftIndent=0, firstLineIndent=0,
                                  textColor=INK, spaceBefore=7),
    "TOCHeading2": ParagraphStyle("TOCHeading2", fontName="Helvetica", fontSize=9.8,
                                  leading=15, leftIndent=16, firstLineIndent=0,
                                  textColor=STEEL, spaceBefore=1),
    "H1": ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=15.5, leading=19,
                         textColor=STEEL_DEEP, spaceBefore=4, spaceAfter=2),
    "H2": ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=12, leading=15,
                         textColor=WHEAT_DEEP, spaceBefore=14, spaceAfter=5),
    "H3": ParagraphStyle("H3", fontName="Helvetica-BoldOblique", fontSize=10.6, leading=14,
                         textColor=STEEL, spaceBefore=10, spaceAfter=4),
    "Body": ParagraphStyle("Body", fontName="Helvetica", fontSize=10, leading=14.4,
                           textColor=INK, spaceAfter=6, alignment=TA_JUSTIFY),
    "BodyLead": ParagraphStyle("BodyLead", fontName="Helvetica-Oblique", fontSize=10.6,
                               leading=15, textColor=STEEL, spaceAfter=8, alignment=TA_JUSTIFY),
    "Bullet": ParagraphStyle("Bullet", fontName="Helvetica", fontSize=10, leading=13.6,
                             textColor=INK, alignment=TA_LEFT),
    "Quote": ParagraphStyle("Quote", fontName="Helvetica-Oblique", fontSize=10.3, leading=14.5,
                            textColor=STEEL_DEEP, leftIndent=4),
    "TableHead": ParagraphStyle("TableHead", fontName="Helvetica-Bold", fontSize=9.3,
                                leading=12, textColor=STEEL_DEEP),
    "TableCell": ParagraphStyle("TableCell", fontName="Helvetica", fontSize=9.3,
                                leading=12.5, textColor=INK),
    "Caption": ParagraphStyle("Caption", fontName="Helvetica-Oblique", fontSize=8.6,
                              leading=11, textColor=CAPTION),
}

def _p(text, style="Body"):
    return Paragraph(text, styles[style])


def h1(text):
    return HeadingFlowable(text, "H1", 0)


def h2(text):
    return HeadingFlowable(text, "H2", 1)


def h3(text):
    return Paragraph(text, styles["H3"])


class HeadingFlowable(Paragraph):
    """Heading paragraph that also carries the TOC level it belongs to."""

    def __init__(self, text, style_name, toc_level):
        super().__init__(text, styles[style_name])
        self.toc_level = toc_level


def bullets(items, bullet_char="–"):
    return ListFlowable(
        [ListItem(Paragraph(t, styles["Bullet"]), spaceBefore=2) for t in items],
        bulletType="bullet", bulletChar=bullet_char, leftIndent=14,
        bulletFontSize=9, spaceBefore=2, spaceAfter=8,
    )


def numbered(items):
    return ListFlowable(
        [ListItem(Paragraph(t, styles["Bullet"]), spaceBefore=3) for t in items],
        bulletType="1", leftIndent=16, bulletFontSize=9.5, spaceBefore=2, spaceAfter=8,
    )


def quote(text):
    inner = Table([[Paragraph(text, styles["Quote"])]], colWidths=[15.4 * cm])
    inner.setStyle(TableStyle([
        ("LINEBEFORE", (0, 0), (0, 0), 2.2, WHEAT),
        ("LEFTPADDING", (0, 0), (0, 0), 12),
        ("TOPPADDING", (0, 0), (0, 0), 6),
        ("BOTTOMPADDING", (0, 0), (0, 0), 6),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#FBF8F2")),
    ]))
    return inner


def data_table(header, rows, col_widths):
    data = [[Paragraph(h, styles["TableHead"]) for h in header]]
    for r in rows:
        data.append([Paragraph(c, styles["TableCell"]) for c in r])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEAD_BG),
        ("GRID", (0, 0), (-1, -1), 0.6, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), TABLE_ROW_ALT))
    t.setStyle(TableStyle(style))
    return t


def rule():
    return HRFlowable(width="100%", thickness=0.8, color=RULE, spaceBefore=2, spaceAfter=14)


# ---------------------------------------------------------------------------
# Doc template com sumário clicável + bookmarks de PDF
# ---------------------------------------------------------------------------
class BriefingDoc(BaseDocTemplate):
    def build(self, flowables, **kwargs):
        self._bookmark_counter = itertools.count()
        super().build(flowables, **kwargs)

    def afterFlowable(self, flowable):
        if isinstance(flowable, HeadingFlowable):
            text = flowable.getPlainText()
            level = flowable.toc_level
            key = "bm-%d" % next(self._bookmark_counter)
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level, closed=False)
            self.notify("TOCEntry", (level, text, self.page, key))


def _header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(CAPTION)
    canvas.drawString(2.1 * cm, 1.3 * cm, "Phorte Aguiar · Briefing interno · Rocha Pan / FIPAN 2026")
    canvas.drawRightString(A4[0] - 2.1 * cm, 1.3 * cm, "Página %d" % doc.page)
    canvas.setStrokeColor(RULE)
    canvas.line(2.1 * cm, 1.6 * cm, A4[0] - 2.1 * cm, 1.6 * cm)
    canvas.restoreState()


def build():
    doc = BriefingDoc(OUT_PATH, pagesize=A4,
                      leftMargin=2.1 * cm, rightMargin=2.1 * cm,
                      topMargin=2.1 * cm, bottomMargin=2.1 * cm,
                      title=DOC_TITLE, author="Phorte Aguiar")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="normal", frames=[frame], onPage=_header_footer)])

    toc = TableOfContents()
    toc.levelStyles = [styles["TOCHeading1"], styles["TOCHeading2"]]

    story = []

    # ---------------- Capa ----------------
    story.append(Spacer(1, 3.4 * cm))
    story.append(_p("Análise Comercial e Logística", "CoverTitle"))
    story.append(_p("Grupo Rocha Pan", "CoverTitle"))
    story.append(_p("Briefing interno para a reunião na FIPAN 2026", "CoverSub"))
    story.append(Spacer(1, 0.3 * cm))
    story.append(_p("Preparado para: Arthur Massimetti · Phorte Aguiar", "CoverMeta"))
    story.append(_p("Data: 23 de julho de 2026 · FIPAN — Expo Center Norte, São Paulo", "CoverMeta"))
    story.append(_p("Assunto: prospecção comercial e logística junto ao Grupo Rocha Pan", "CoverMeta"))
    story.append(Spacer(1, 1.4 * cm))

    box = Table([[Paragraph("Veredito em uma frase", styles["CoverBoxTitle"])],
                 [Paragraph(
                     "Vale muito a prospecção — mas a entrada precisa ser cirúrgica: "
                     "não venda “frete”, venda capacidade, contingência, previsibilidade e "
                     "expansão sem o grupo precisar aumentar a frota própria.",
                     styles["CoverBoxBody"])]],
                colWidths=[15.4 * cm])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FBF8F2")),
        ("LINEABOVE", (0, 0), (-1, 0), 2, WHEAT),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (0, 0), 12),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 14),
        ("TOPPADDING", (0, 1), (-1, 1), 4),
    ]))
    story.append(box)
    story.append(PageBreak())

    # ---------------- Sumário ----------------
    story.append(_p("Sumário", "SumarioTitle"))
    story.append(_p(
        "Clique em qualquer linha para ir direto à seção. O leitor de PDF também mostra "
        "esses mesmos títulos como marcadores (bookmarks) na lateral, para navegar sem "
        "precisar voltar aqui.", "Caption"))
    story.append(Spacer(1, 10))
    story.append(toc)
    story.append(PageBreak())

    # ================= Conclusão direta =================
    story.append(h1("Minha conclusão direta"))
    story.append(rule())
    story.append(_p(
        "O Grupo Rocha Pan é um prospect relevante para transporte rodoviário, porque reúne "
        "indústria, distribuição, armazenamento, produtos secos e congelados, operação "
        "regional própria e rede nacional de distribuidores."))
    story.append(_p(
        "Mas existe uma pegadinha importante: eles não parecem ser uma empresa com logística "
        "fraca procurando alguém para “resolver tudo”. O grupo afirma ter estrutura logística "
        "integrada e publicou recentemente investimento em frota própria nova. Portanto, a melhor "
        "abordagem não é “substituir a frota deles”, mas oferecer:"))
    story.append(bullets([
        "capacidade adicional em picos;",
        "transferência entre unidades;",
        "rotas longas que não compensam para a frota própria;",
        "operação dedicada;",
        "distribuição regional fora da área principal;",
        "cadeia refrigerada para a Friore;",
        "coleta de fornecedores e logística reversa.",
    ]))
    story.append(_p("<b>Essa é uma conta potencialmente boa, mas a entrada precisa ser cirúrgica.</b>"))

    # ================= 1. Visão geral =================
    story.append(h1("1. Visão geral da empresa"))
    story.append(rule())
    story.append(_p(
        "O Grupo Rocha Pan foi fundado em 1988 e atua no setor de alimentos, principalmente no "
        "fornecimento de insumos e produtos para padarias, confeitarias, pizzarias, restaurantes e "
        "negócios de alimentação. O LinkedIn da empresa indica porte de 201 a 500 funcionários, "
        "sede em São Mateus, São Paulo, e operação integrada entre indústria, estoque, "
        "distribuição e suporte técnico."))
    story.append(_p("As principais marcas apresentadas pelo grupo são:"))
    story.append(bullets([
        "<b>Rocha Pan</b>: distribuição de produtos e insumos para food service;",
        "<b>Bonasse</b>: fabricação de pré-misturas, melhoradores, recheios e soluções para "
        "panificação e confeitaria;",
        "<b>Friore</b>: fabricação e distribuição de alimentos congelados;",
        "<b>Concorde</b>: marca originária do Rio de Janeiro, agora pertencente ao grupo e em "
        "expansão nacional.",
    ]))
    story.append(_p(
        "A empresa declara atender mais de 23 estados por meio de distribuidores parceiros. Isso "
        "significa que parte da expansão nacional provavelmente acontece por transferências "
        "maiores até distribuidores regionais, em vez de entregas diretas da fábrica para cada "
        "cliente final."))

    # ================= 2. Perfil das cargas =================
    story.append(h1("2. Perfil das cargas"))
    story.append(rule())
    story.append(h2("Linha seca — Bonasse, Concorde e distribuição Rocha Pan"))
    story.append(_p("A Bonasse trabalha com produtos como:"))
    story.append(bullets([
        "pré-misturas para bolos e pães;", "melhoradores;", "creme de confeiteiro;",
        "recheios e coberturas;", "produtos em embalagens de 1 kg e 5 kg;",
        "fardos e caixas de múltiplas unidades.",
    ]))
    story.append(_p(
        "Há produtos embalados em caixas de 4 × 5 kg, fardos de 5 × 1 kg, 10 × 1 kg e 12 × 1 kg, "
        "além de embalagens industriais maiores. Isso indica uma operação compatível com carga "
        "seca, paletizada, caixas, fardos e eventualmente sacaria."))

    story.append(h2("Veículos provavelmente aplicáveis"))
    story.append(_p("Minha leitura operacional:"))
    story.append(bullets([
        "VUC e 3/4 para entregas urbanas;", "toco e truck para distribuição regional;",
        "carreta baú para transferências;",
        "sider para cargas paletizadas, dependendo do padrão de descarga;",
        "veículos secos, limpos, vedados e dedicados a alimentos.",
    ]))
    story.append(_p(
        "Essa parte não exige refrigeração, mas exige controle de higiene, umidade, avarias e "
        "contaminação cruzada."))

    story.append(h2("Linha congelada — Friore"))
    story.append(_p("A Friore trabalha com produtos congelados como:"))
    story.append(bullets([
        "pão de queijo;", "salgados;", "coxinhas;", "quibes;", "churros;",
        "pães pré-assados;", "bolos e sobremesas.",
    ]))
    story.append(_p(
        "A própria empresa informa que trabalha somente com produtos congelados e utiliza "
        "motoristas próprios em parte das entregas. Para São Paulo Capital e Baixada Santista, o "
        "prazo informado é de até 48 horas; nas regiões próximas à capital, as entregas ocorrem "
        "de uma a três vezes por semana."))
    story.append(_p("Aqui existe uma operação logística diferente da Bonasse:"))
    story.append(bullets([
        "veículo refrigerado;", "monitoramento de temperatura;",
        "controle de abertura de portas;", "roteirização mais rígida;", "entrega rápida;",
        "gestão de devoluções;", "contingência em caso de quebra do equipamento de refrigeração.",
    ]))
    story.append(_p(
        "A Friore também afirma estar buscando distribuidores fora da Grande São Paulo, o que "
        "pode gerar demanda para transferências refrigeradas entre a fábrica e distribuidores "
        "autorizados."))

    # ================= 3. Mapa dos polos =================
    story.append(h1("3. Mapa dos polos operacionais"))
    story.append(rule())
    story.append(h2("Polos confirmados"))
    story.append(data_table(
        ["Polo", "O que está confirmado", "Possível papel logístico"],
        [
            ["São Mateus — São Paulo", "Endereço oficial na Rua André de Almeida, 2100",
             "Sede, operação comercial, armazenagem e distribuição"],
            ["Zona Leste — São Paulo", "Sede institucional e principal concentração do grupo",
             "Origem provável de transferências e entregas regionais"],
            ["Bauru — SP", "Unidade inaugurada em 2019",
             "Provável apoio comercial/distribuição para o Centro-Oeste paulista"],
            ["Interior de SP", "Atuação em Botucatu, Bauru, Catanduva, Araçatuba e Marília",
             "Distribuição regional e possíveis rotas recorrentes"],
            ["Norte do Paraná", "Região declarada como relevante",
             "Transferência interestadual e abastecimento de distribuidores"],
            ["Mais de 23 estados", "Atendimento por distribuidores parceiros",
             "Transferências nacionais para parceiros regionais"],
        ],
        [3.9 * cm, 6.0 * cm, 5.5 * cm],
    ))
    story.append(Spacer(1, 8))
    story.append(_p(
        "O endereço oficial publicado pela Bonasse é Rua André de Almeida, 2100, em São Mateus. "
        "O histórico oficial confirma a abertura da unidade de Bauru em 2019 e a expansão de um "
        "galpão de 7.000 m² para a distribuidora em agosto de 2023."))
    story.append(_p("A Bonasse declara atuação relevante em:"))
    story.append(bullets([
        "Grande ABC;", "Litoral Paulista;", "Vale do Paraíba;", "Bragança Paulista;",
        "Limeira;", "Botucatu;", "Bauru;", "Catanduva;", "Araçatuba;", "Marília;",
        "Norte do Paraná.",
    ]))

    story.append(h2("Correção importante sobre Bauru"))
    story.append(_p(
        "A existência da unidade está confirmada, mas eu não encontrei uma confirmação pública "
        "segura do endereço, tamanho ou função operacional."))
    story.append(_p("Ela pode ser:"))
    story.append(bullets([
        "filial comercial;", "ponto de apoio;", "base de vendedores;", "armazém;",
        "centro de distribuição;", "operação terceirizada.",
    ]))
    story.append(_p("Portanto, não chegue dizendo:"))
    story.append(quote("“Sabemos que vocês têm um CD em Bauru.”"))
    story.append(Spacer(1, 6))
    story.append(_p("Use:"))
    story.append(quote(
        "“Vimos que o grupo possui uma unidade em Bauru e queremos entender como funciona o "
        "abastecimento dessa operação.”"))
    story.append(Spacer(1, 6))
    story.append(_p("É mais preciso e evita que você comece a conversa afirmando algo errado."))

    story.append(h2("Unidades que precisam ser validadas"))
    story.append(_p(
        "Uma base empresarial secundária, atualizada em julho de 2026, associa CNPJs da Rocha Pan "
        "aos seguintes endereços:"))
    story.append(bullets([
        "Rua Ioneji Matsubayashi, 180 — Zona Leste de São Paulo;",
        "Rua André de Almeida, 2100 — São Paulo;",
        "Avenida Forte do Leme, 780 — São Paulo;",
        "Avenida Plínio Salgado, 538 — Varginha/MG.",
    ]))
    story.append(_p(
        "Esses dados são interessantes para prospecção, mas eu não trataria todos como polos "
        "logísticos ativos sem confirmação direta. CNPJ ativo em determinado endereço não "
        "significa necessariamente que o local continue operando como fábrica ou CD."))
    story.append(_p(
        "Varginha, especialmente, merece investigação. Caso seja uma filial comercial ou "
        "atacadista ativa, pode existir um corredor:"))
    story.append(_p("<b>São Paulo -&gt; Sul de Minas</b>", "BodyLead"))
    story.append(_p("Mas essa rota ainda precisa ser confirmada com o grupo."))

    # ================= 4. Como a operação funciona =================
    story.append(h1("4. Como a operação provavelmente funciona"))
    story.append(rule())
    story.append(h2("Fluxo de entrada"))
    story.append(_p(
        "O site institucional apresenta como parceiras marcas como Barry Callebaut, Harald, Vigor, "
        "Nestlé, Palsgaard, Piracanjuba, Master Martini e Seara. Isso indica uma operação "
        "relevante de compra e distribuição de ingredientes, lácteos, chocolates, gorduras, "
        "recheios e produtos alimentícios — mas os logotipos não provam, sozinhos, quais "
        "produtos são comprados ou quais unidades recebem as cargas."))
    story.append(_p("Os fluxos de entrada provavelmente envolvem:"))
    story.append(bullets([
        "ingredientes para fabricação Bonasse;", "insumos para fabricação Friore;",
        "embalagens e caixas;", "produtos de marcas parceiras para redistribuição;",
        "materiais de apoio para padarias e confeitarias.",
    ]))

    story.append(h2("Oportunidade comercial"))
    story.append(_p(
        "Oferecer milk run de fornecedores pode ser mais interessante do que simplesmente "
        "oferecer uma carreta avulsa:"))
    story.append(bullets([
        "coletar em dois ou três fornecedores;", "consolidar a carga;",
        "entregar na fábrica ou no CD;",
        "retornar pallets, embalagens ou mercadorias recusadas.",
    ]))
    story.append(_p(
        "Não encontrei publicamente os fornecedores de origem, volumes ou programação de "
        "coletas. Essa informação precisa ser levantada na reunião."))

    story.append(h2("Fluxo de saída"))
    story.append(h3("Distribuição própria regional"))
    story.append(_p(
        "A empresa publicou recentemente que possui frota própria nova, destacando controle, "
        "eficiência e pontualidade. A Friore também afirma que determinadas entregas são "
        "realizadas pelos próprios motoristas."))
    story.append(_p("Isso sugere que a frota própria provavelmente é utilizada nas rotas:"))
    story.append(bullets([
        "Grande São Paulo;", "ABC;", "Capital;", "Baixada Santista;",
        "entregas recorrentes de curta e média distância;",
        "clientes estratégicos com frequência elevada.",
    ]))
    story.append(h3("Transferência para distribuidores"))
    story.append(_p(
        "A presença em mais de 23 estados acontece por meio de distribuidores parceiros. "
        "Portanto, existe uma boa chance de haver:"))
    story.append(bullets([
        "cargas fechadas para distribuidores;", "consolidação semanal;",
        "transferências interestaduais;", "embarques sazonais;",
        "complementação com transportadoras terceirizadas.",
    ]))
    story.append(_p(
        "Uma transportadora chamada RD exibe a Rocha Pan entre as empresas atendidas e informa "
        "atuação com transporte fracionado e armazenagem. Isso sugere que o grupo pode utilizar "
        "fornecedores logísticos externos, embora não seja possível confirmar se a relação "
        "continua ativa atualmente."))

    # ================= 5. Melhor oportunidade =================
    story.append(h1("5. Onde está a melhor oportunidade para você"))
    story.append(rule())

    story.append(h2("1. Overflow da frota própria"))
    story.append(_p("Essa provavelmente é a porta de entrada mais fácil."))
    story.append(_p(
        "Proposta: disponibilização de veículos para picos, férias, manutenção, sazonalidade, "
        "promoções, lançamentos e aumento inesperado de pedidos."))
    story.append(_p(
        "Você não concorre diretamente com a frota própria. Você vira a capacidade reserva que "
        "evita ruptura."))
    story.append(_p("<b>Aderência: muito alta.</b>"))

    story.append(h2("2. Transferência São Paulo &lt;-&gt; Bauru"))
    story.append(_p("Essa é uma hipótese comercial forte porque:"))
    story.append(bullets([
        "a unidade de Bauru existe;",
        "o grupo atende várias cidades do Centro-Oeste e Noroeste paulista;",
        "São Paulo concentra a sede e as operações industriais;",
        "Bauru é um ponto natural de redistribuição para Botucatu, Marília, Araçatuba e "
        "regiões próximas.",
    ]))
    story.append(_p("Mas a frequência, o volume e a função da unidade precisam ser confirmados."))
    story.append(_p("Uma proposta interessante seria:"))
    story.append(bullets([
        "saída noturna de São Paulo;", "chegada em Bauru pela manhã;",
        "transferência paletizada;",
        "retorno com devoluções, pallets ou coleta regional;",
        "frequência fixa de duas a cinco viagens semanais.",
    ]))
    story.append(_p("Isso é um modelo de proposta, não uma rota já comprovada."))

    story.append(h2("3. São Paulo &lt;-&gt; Norte do Paraná"))
    story.append(_p(
        "O Norte do Paraná aparece oficialmente entre as regiões relevantes da Bonasse. "
        "Portanto, é uma rota plausível para distribuidores ou clientes regionais."))
    story.append(_p("Cidades que devem ser investigadas comercialmente:"))
    story.append(bullets(["Londrina;", "Maringá;", "Arapongas;", "Cambé;", "Apucarana."]))
    story.append(_p(
        "Não encontrei confirmação pública de qual cidade recebe as cargas. Não prometa uma "
        "operação específica antes de descobrir o distribuidor responsável."))

    story.append(h2("4. Transferências para distribuidores nacionais"))
    story.append(_p("Como o grupo atende mais de 23 estados, pode existir demanda para:"))
    story.append(bullets([
        "São Paulo -&gt; Minas Gerais;", "São Paulo -&gt; Paraná;",
        "São Paulo -&gt; Rio de Janeiro;", "São Paulo -&gt; Espírito Santo;",
        "São Paulo -&gt; Goiás;", "São Paulo -&gt; Santa Catarina;",
        "São Paulo -&gt; distribuidores do Nordeste.",
    ]))
    story.append(_p(
        "Aqui, a oferta ideal é carga fechada ou transferência programada, não distribuição "
        "porta a porta nacional."))

    story.append(h2("5. Operação refrigerada Friore"))
    story.append(_p("Essa pode ser a operação de maior valor agregado, mas exige mais estrutura."))
    story.append(_p("Possibilidades:"))
    story.append(bullets([
        "transferência refrigerada fábrica -&gt; distribuidor;",
        "veículo reserva para falha da frota própria;",
        "operação dedicada para Interior de SP;", "expansão para novas regiões;",
        "distribuição refrigerada fora da Grande São Paulo;",
        "contingência de câmara fria e transporte.",
    ]))
    story.append(_p(
        "<b>Aderência: alta</b>, desde que você possua veículo refrigerado, controle de "
        "temperatura e experiência com alimentos congelados."))

    story.append(h2("6. Logística reversa"))
    story.append(_p("Pode envolver:"))
    story.append(bullets([
        "retorno de pallets;", "devoluções comerciais;", "produtos recusados;",
        "embalagens;", "mercadorias próximas do vencimento;",
        "recolhimento de produtos em distribuidores;", "troca de mercadoria avariada.",
    ]))
    story.append(_p(
        "A vantagem é reduzir viagens vazias e melhorar o custo total da operação."))

    # ================= 6. O que não oferecer =================
    story.append(h1("6. O que não oferecer primeiro"))
    story.append(rule())
    story.append(_p("Eu evitaria começar com:"))
    story.append(quote("“Temos carretas disponíveis para qualquer rota.”"))
    story.append(_p("Isso é genérico e joga você diretamente para uma disputa de preço.",
                     "Body"))
    story.append(_p("Também evitaria:"))
    story.append(quote("“Queremos assumir toda a logística de vocês.”"))
    story.append(_p(
        "Eles têm estrutura própria e investem em frota. Isso provavelmente gera resistência."))
    story.append(_p("A abordagem mais inteligente é:"))
    story.append(quote(
        "“Queremos complementar a operação de vocês nas rotas em que a frota própria perde "
        "produtividade, especialmente transferências, picos de demanda, expansão regional e "
        "contingência.”"))
    story.append(_p("Você deixa de ser “mais uma transportadora” e passa a ser solução de capacidade."))

    # ================= 7. Proposta comercial =================
    story.append(h1("7. Proposta comercial ideal"))
    story.append(rule())
    story.append(h2("Oferta 1 — Capacidade contingencial"))
    story.append(bullets([
        "veículos sob demanda;", "SLA de disponibilização;", "cobertura em picos;",
        "substituição emergencial;", "monitoramento;", "comprovante de entrega digital.",
    ]))
    story.append(h2("Oferta 2 — Transferência dedicada"))
    story.append(bullets([
        "veículo dedicado;", "janela fixa;", "preço mensal ou por ciclo;",
        "São Paulo &lt;-&gt; Bauru;", "São Paulo &lt;-&gt; Norte do Paraná;",
        "São Paulo &lt;-&gt; distribuidores;", "retorno programado.",
    ]))
    story.append(h2("Oferta 3 — Operação refrigerada"))
    story.append(bullets([
        "veículos refrigerados;", "registro de temperatura;", "plano de contingência;",
        "rastreamento;", "gerenciamento de ocorrências;", "entrega para distribuidores Friore.",
    ]))
    story.append(h2("Oferta 4 — Coleta de fornecedores"))
    story.append(bullets([
        "programação das coletas;", "consolidação;", "acompanhamento;",
        "entrega na fábrica;", "redução de fretes individuais;",
        "retorno de pallets e embalagens.",
    ]))

    # ================= 8. Argumentos =================
    story.append(h1("8. Argumentos que têm chance de funcionar"))
    story.append(rule())
    story.append(_p("Não venda apenas “caminhão”. Venda indicadores:"))
    story.append(bullets([
        "previsibilidade de disponibilidade;", "redução de ruptura;",
        "cumprimento de janela;", "rastreamento em tempo real;", "baixa avaria;",
        "veículo apropriado para alimentos;", "controle de temperatura;",
        "retorno rápido de comprovantes;", "plano de contingência;",
        "redução de quilometragem vazia;", "acompanhamento de ocorrências;",
        "integração de informações.",
    ]))
    story.append(_p(
        "Uma operação desse porte provavelmente já recebeu dezenas de apresentações dizendo "
        "“temos qualidade e pontualidade”. Isso virou ruído corporativo."))
    story.append(_p("Apresente algo mensurável:"))
    story.append(quote(
        "98% de cumprimento de janela, veículo reserva, atualização automática da viagem e "
        "comunicação da ocorrência antes de a entrega atrasar."))

    # ================= 9. Perguntas =================
    story.append(h1("9. Perguntas para fazer na reunião"))
    story.append(rule())
    story.append(numbered([
        "Quais endereços funcionam atualmente como fábrica, CD e filial?",
        "Qual é a função operacional da unidade de Bauru?",
        "Quais rotas são feitas com frota própria?",
        "Quais rotas são terceirizadas?",
        "Quais são os principais destinos interestaduais?",
        "Existe transferência fixa para distribuidores?",
        "Qual é o volume médio semanal por região?",
        "Qual é a sazonalidade do negócio?",
        "A Bonasse e a Friore compartilham transportadoras?",
        "A Friore exige veículo refrigerado em quais faixas e rotas?",
        "Quais são os maiores problemas atuais: falta de veículo, atraso, avaria ou custo?",
        "Eles trabalham com tabela, concorrência, portal ou contrato dedicado?",
        "Existe demanda de retorno de pallets e mercadorias?",
        "Quais horários e janelas de carga têm maior fila?",
        "Existe interesse em veículo dedicado com preço mensal?",
    ]))

    # ================= 10. Avaliação =================
    story.append(h1("10. Avaliação da oportunidade"))
    story.append(rule())
    story.append(data_table(
        ["Critério", "Minha avaliação"],
        [
            ["Volume potencial", "9/10"],
            ["Recorrência das operações", "9/10"],
            ["Variedade de serviços", "9/10"],
            ["Potencial de rotas interestaduais", "8/10"],
            ["Facilidade de entrar", "5/10"],
            ["Concorrência com frota própria", "Alta"],
            ["Potencial de operação dedicada", "8/10"],
            ["Potencial refrigerado", "8/10"],
            ["Melhor porta de entrada", "Overflow e transferências"],
        ],
        [9.7 * cm, 5.7 * cm],
    ))

    # ================= Veredito =================
    story.append(h1("Veredito"))
    story.append(rule())
    story.append(_p("<b>Vale muito a prospecção.</b>"))
    story.append(_p(
        "Mas o argumento enviado inicialmente estava confiante demais sobre rotas e fornecedores "
        "que não estão comprovados. A tese correta é:"))
    story.append(bullets([
        "São Paulo é o principal polo confirmado;",
        "Bauru é uma unidade confirmada, mas sua função precisa ser descoberta;",
        "o Interior de SP e o Norte do Paraná são áreas comerciais relevantes;",
        "existem mais de 23 estados atendidos por distribuidores;",
        "a Friore gera oportunidade refrigerada;",
        "o grupo tem frota própria;",
        "a oportunidade está em complementar, ampliar e proteger a operação existente.",
    ]))
    story.append(_p(
        "<b>Não venda “frete”. Venda capacidade, contingência, previsibilidade e expansão sem "
        "necessidade de aumentar frota própria.</b>"))

    # ================= Oportunidade imediata =================
    story.append(h1("Oportunidade imediata"))
    story.append(rule())
    story.append(_p(
        "Hoje, 23 de julho de 2026, o grupo está participando da FIPAN 2026 no Expo Center Norte, "
        "em São Paulo, e o evento vai até 24 de julho. A publicação institucional menciona o "
        "estande no Pavilhão Azul. É uma oportunidade muito boa para encontrar presencialmente "
        "pessoas do comercial, distribuição e possivelmente da operação."))
    story.append(_p("A abertura mais forte seria:"))
    story.append(quote(
        "“Vimos que vocês estão expandindo a presença nacional e também investindo na frota "
        "própria. Nossa proposta não é substituir essa estrutura, mas apoiar transferências, "
        "picos e rotas em que manter capacidade própria pode aumentar a ociosidade.”"))

    doc.multiBuild(story)
    print("PDF gerado em:", os.path.abspath(OUT_PATH))


if __name__ == "__main__":
    build()
