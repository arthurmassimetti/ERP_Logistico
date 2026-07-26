"""
Importa as contas a pagar AVULSAS da planilha MOVIMENTAÇÃO DIARIA -> contas_pagar.

A aba '2026' dessa planilha e um painel com varios blocos lado a lado.
O bloco financeiro ocupa as colunas 21-24 (CONTAS | R$ | PGT | forma) e aparece
em tres pedacos, que viram o campo 'grupo':
    'contas'  -> bloco principal (linhas ~3-15 e ~34-36)
    'atraso'  -> bloco CONTAS ATRASO
    'futuras' -> bloco CONTAS FUTURAS (colunas 25-28)

Idempotente: identifica cada conta por (descricao, valor, vencimento) e so
insere as que ainda nao existem. Rodar duas vezes nao duplica nada.

NAO importa a linha 'FOLHA SALARIAL' (R$ 5.000): ela ja existe em contas_fixas
como 'FOLHA PHORTE' — lancar de novo aqui seria contar o mesmo gasto duas vezes.

Uso:
    python importar_avulsas.py --dry-run
    python importar_avulsas.py
"""
import argparse
from datetime import date, datetime
from pathlib import Path

import openpyxl

from db import supabase

from fontes_planilhas import XLSX_MOVIMENTACAO as PLANILHA

# descricoes que NAO devem virar conta avulsa (ja existem como conta fixa)
IGNORAR = {"FOLHA SALARIAL"}

# categoria por palavra-chave na descricao (mesmo criterio ja usado nos 7 registros existentes)
def categorizar(desc):
    d = desc.upper()
    if any(k in d for k in ("DARF", "PIS", "COFINS", "IRPJ", "CSLL", "ICMS", "ISS")):
        return "Impostos"
    if "POSTO" in d or "COMBUST" in d or "DIESEL" in d:
        return "Combustível"
    if any(k in d for k in ("EIXO", "PNEU", "OFICINA", "MANUT", "TRUCK")):
        return "Manutenção"
    if "CART" in d:
        return "Cartão"
    if any(k in d for k in ("PENSÃO", "PENSAO", "MESADA")):
        return "Pessoal"
    return "Outros"


def d_iso(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return None


def num(v):
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    return None


def ler_planilha():
    """Le os tres blocos financeiros. Retorna lista de dicts prontos p/ contas_pagar."""
    wb = openpyxl.load_workbook(PLANILHA, data_only=True, read_only=True)
    ws = wb["2026"]
    linhas = list(ws.iter_rows(values_only=True))
    wb.close()

    achadas, grupo_atual = [], "contas"

    def coletar(row, c_desc, c_val, c_venc, c_forma, grupo):
        if len(row) <= c_forma:
            return
        desc, val, venc = row[c_desc], num(row[c_val]), d_iso(row[c_venc])
        if not desc or val is None or not venc:
            return
        desc = str(desc).strip()
        # cabecalhos e totais nao sao contas
        if desc.upper() in ("CONTAS", "TOTAL", "TOTAL:", "CONTAS ATRASO", "CONTAS FUTURAS"):
            return
        if desc.upper() in IGNORAR:
            return
        achadas.append({
            "descricao": desc,
            "valor": val,
            "vencimento": venc,
            "forma": str(row[c_forma]).strip() if row[c_forma] else None,
            "categoria": categorizar(desc),
            "grupo": grupo,
        })

    for row in linhas:
        if not row:
            continue
        rotulos = {str(c).strip().upper() for c in row if c is not None}
        if "CONTAS ATRASO" in rotulos:
            grupo_atual = "atraso"
        # o bloco de atraso termina na propria linha de TOTAL:; o que vem
        # depois volta a ser conta normal (e assim que os 7 registros ja
        # migrados estao classificados — o DARF de 43,32 abaixo do total
        # esta como 'contas', nao 'atraso')
        elif grupo_atual == "atraso" and any(
                str(c).strip().upper() in ("TOTAL", "TOTAL:") for c in row if c is not None):
            grupo_atual = "contas"
        # bloco principal / atraso: colunas 21..24
        coletar(row, 21, 22, 23, 24, grupo_atual)
        # bloco "contas futuras": colunas 25..28
        coletar(row, 25, 26, 27, 28, "futuras")

    return achadas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    achadas = ler_planilha()
    existentes = supabase.table("contas_pagar").select("descricao,valor,vencimento").execute().data
    chave = lambda c: (str(c["descricao"]).strip().upper(), round(float(c["valor"]), 2), str(c["vencimento"])[:10])
    ja_tem = {chave(c) for c in existentes}

    novas = [c for c in achadas if chave(c) not in ja_tem]

    print(f"Planilha : {len(achadas)} contas avulsas no bloco financeiro")
    print(f"No banco : {len(existentes)}")
    print(f"Faltando : {len(novas)}\n")

    if not novas:
        print("Nada a importar — banco já está em dia com a planilha.")
        return

    for c in novas:
        print(f"  + {c['descricao'][:26]:26} R$ {c['valor']:>10,.2f}  venc {c['vencimento']}  "
              f"{str(c['forma'])[:9]:9} [{c['grupo']}/{c['categoria']}]")
    print(f"\n  Soma a importar: R$ {sum(c['valor'] for c in novas):,.2f}")

    if args.dry_run:
        print("\n--dry-run: nada foi gravado.")
        return

    supabase.table("contas_pagar").insert(novas).execute()
    total = supabase.table("contas_pagar").select("id", count="exact").limit(1).execute().count
    print(f"\n  Importadas. contas_pagar agora tem {total} registros.")


if __name__ == "__main__":
    main()
