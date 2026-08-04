"""Sincroniza o banco com a MOVIMENTAÇÃO DIARIA (a planilha e a fonte de verdade destes campos).

Escopo deliberadamente estreito — SO os campos que a planilha realmente controla:
  - veiculos.km_atual / km_troca / media_kml / media_data
  - contas_pagar: insere as avulsas do bloco FINANCEIRO que ainda nao existem
  - saldos_banco: atualiza saldo dos bancos existentes e cria o que faltar

NAO mexe em: fretes, motoristas, abastecimentos, manutencoes, checklists,
ocorrencias, contas fixas, vales — nada disso mudou na planilha (conferido).

Uso:  python atualizar_do_movimentacao.py            (simulacao, nao grava)
      python atualizar_do_movimentacao.py --aplicar  (grava)
"""
import sys, os, re, argparse
from pathlib import Path
from datetime import date, datetime
import openpyxl

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import supabase as sb

ap = argparse.ArgumentParser()
ap.add_argument("--aplicar", action="store_true", help="grava de verdade (sem isso e simulacao)")
args = ap.parse_args()
GRAVA = args.aplicar

# os saldos da planilha nao trazem o prefixo "PH" que o banco usa; mapeamento explicito
# pra nao criar conta duplicada por diferenca de grafia
APELIDO_BANCO = {"BRADESCO": "PH BRADESCO", "ITAU": "PH ITAU", "CAIXA": "CAIXA"}

ALIAS = {"NNX3195": "NNX3I95", "EYD9D85": "EYV9D85"}
def placa(p):
    if p is None: return None
    s = re.sub(r"\s+", "", str(p)).upper()
    return ALIAS.get(s, s)
def d_iso(v):
    if isinstance(v, datetime): return v.date().isoformat()
    if isinstance(v, date): return v.isoformat()
    return None
def n(v): return float(v) if isinstance(v, (int, float)) else None
def t(v):
    if v is None: return None
    s = str(v).strip()
    return s or None

XLSX = Path(__file__).resolve().parent.parent / "fontes" / "MOVIMENTAÇÃO DIARIA.xlsx"
wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
linhas = list(wb["2026"].iter_rows(values_only=True))
wb.close()
col = lambda row, i: row[i] if row and len(row) > i else None

km, medias, contas, saldos = {}, {}, [], []
for i, row in enumerate(linhas):
    if not row: continue
    p = placa(col(row, 0))
    if p and n(col(row, 2)):
        km[p] = {"km_atual": int(n(col(row, 2))), "km_troca": int(n(col(row, 4)) or 0) or None}
    p = placa(col(row, 8))
    if p and n(col(row, 10)):
        medias[p] = {"media_kml": round(n(col(row, 10)), 3), "media_data": d_iso(col(row, 11))}
    desc, val, venc = t(col(row, 21)), n(col(row, 22)), d_iso(col(row, 23))
    if desc and val is not None and venc and "TOTAL" not in desc.upper():
        contas.append({"descricao": desc, "valor": val, "vencimento": venc, "forma": t(col(row, 24))})
    if any(t(c) == "SALDO:" for c in row if c is not None):
        ant = linhas[i-1] if i else []
        for j in (16, 17, 18, 19):
            nome, v = t(col(ant, j)), n(col(row, j))
            if nome and v is not None: saldos.append({"banco": nome, "saldo": v})

print("MODO:", "APLICANDO (grava no banco)" if GRAVA else "SIMULACAO (nao grava nada)")
print()

# ---------------- veiculos ----------------
print("=" * 70)
print("VEICULOS — km e media")
veic = {v["placa"]: v for v in sb.table("veiculos").select("*").execute().data}
mudou = 0
for p in sorted(set(km) | set(medias)):
    v = veic.get(p)
    if not v:
        print(f"  {p}: nao existe no banco — IGNORADO")
        continue
    novo = {}
    if p in km:
        if v.get("km_atual") is None or int(v["km_atual"]) != km[p]["km_atual"]:
            novo["km_atual"] = km[p]["km_atual"]
        if km[p]["km_troca"] and (v.get("km_troca") is None or int(v["km_troca"]) != km[p]["km_troca"]):
            novo["km_troca"] = km[p]["km_troca"]
    if p in medias:
        if v.get("media_kml") is None or abs(float(v["media_kml"]) - medias[p]["media_kml"]) > 0.0005:
            novo["media_kml"] = medias[p]["media_kml"]
        if medias[p]["media_data"] and v.get("media_data") != medias[p]["media_data"]:
            novo["media_data"] = medias[p]["media_data"]
    if not novo:
        continue
    mudou += 1
    antes = {k: v.get(k) for k in novo}
    print(f"  {p}: {antes}  ->  {novo}")
    if GRAVA:
        sb.table("veiculos").update(novo).eq("placa", p).execute()
print(f"  ({mudou} veiculo(s) a atualizar)")

# ---------------- contas a pagar ----------------
print()
print("=" * 70)
print("CONTAS A PAGAR — insere as que faltam")
cp = sb.table("contas_pagar").select("descricao,vencimento").execute().data
existentes = {(str(c["descricao"]).strip().upper(), c["vencimento"]) for c in cp}
novas = [c for c in contas if (c["descricao"].strip().upper(), c["vencimento"]) not in existentes]
for c in novas:
    print(f"  + {c['vencimento']}  {c['descricao'][:38]:38} R$ {c['valor']:>10,.2f}  {c['forma'] or ''}")
    if GRAVA:
        sb.table("contas_pagar").insert({
            "descricao": c["descricao"], "valor": c["valor"],
            "vencimento": c["vencimento"], "forma": c["forma"], "grupo": "avulsa",
        }).execute()
print(f"  ({len(novas)} a inserir; as {len(cp)} que ja estao no banco nao sao tocadas)")

# ---------------- saldos ----------------
print()
print("=" * 70)
print("SALDOS BANCARIOS")
atuais = {s["banco"]: s for s in sb.table("saldos_banco").select("*").execute().data}
for s in saldos:
    nome = APELIDO_BANCO.get(s["banco"].upper(), s["banco"])
    existente = atuais.get(nome)
    if existente:
        if abs(float(existente["saldo"]) - s["saldo"]) > 0.005:
            print(f"  {nome}: {float(existente['saldo']):,.2f}  ->  {s['saldo']:,.2f}")
            if GRAVA:
                sb.table("saldos_banco").update(
                    {"saldo": s["saldo"], "atualizado_em": datetime.now().astimezone().isoformat()}
                ).eq("id", existente["id"]).execute()
        else:
            print(f"  {nome}: ja esta em {s['saldo']:,.2f}")
    else:
        print(f"  + {nome}: cria com saldo {s['saldo']:,.2f}  (nao existia no banco)")
        if GRAVA:
            sb.table("saldos_banco").insert({"banco": nome, "saldo": s["saldo"]}).execute()

print()
print("FIM.", "Gravado." if GRAVA else "Nada foi gravado — rode com --aplicar para valer.")
