"""
Backup completo do banco -> arquivos JSON datados.

Exporta TODAS as tabelas do Supabase para uma pasta com carimbo de data/hora,
em JSON legível (uma lista de objetos por tabela) + um resumo com as contagens.

Uso:
    python backup_banco.py                 # grava em ../backups/AAAA-MM-DD_HHMM/
    python backup_banco.py --pasta X       # grava em X

É somente-leitura no banco: nunca altera nada. Rode antes de qualquer
importação, limpeza ou migração.
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from db import supabase

# todas as tabelas do schema (mesma lista do db.py + as criadas depois)
TABELAS = [
    "motoristas", "perfis", "veiculos", "abastecimentos", "manutencoes",
    "metricas_config", "roteiro", "fretes", "checklists", "categorias_carga",
    "contas_fixas", "contas_pagar", "saldos_banco", "vales", "folha_semanal",
    "ordens_manutencao", "ocorrencias",
]

# chave usada para ordenar cada tabela (deixa o arquivo estável entre execuções).
# Nem toda tabela tem "id": veiculos usa placa, perfis usa user_id.
ORDEM = {"veiculos": "placa", "saldos_banco": "banco", "perfis": "user_id"}


def baixar(tabela, pagina=1000):
    """Baixa a tabela inteira, paginando (o PostgREST corta em 1000 por padrão)."""
    col = ORDEM.get(tabela, "id")
    linhas, inicio = [], 0
    while True:
        r = (supabase.table(tabela).select("*")
             .order(col).range(inicio, inicio + pagina - 1).execute())
        linhas.extend(r.data)
        if len(r.data) < pagina:
            break
        inicio += pagina
    return linhas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pasta", help="pasta de destino (padrão: ../backups/<data>)")
    args = ap.parse_args()

    carimbo = datetime.now().strftime("%Y-%m-%d_%H%M")
    destino = Path(args.pasta) if args.pasta else (
        Path(__file__).resolve().parent.parent / "backups" / carimbo)
    destino.mkdir(parents=True, exist_ok=True)

    print(f"Backup em: {destino}\n")
    resumo = {"gerado_em": datetime.now().isoformat(), "tabelas": {}}
    total = 0

    for t in TABELAS:
        try:
            linhas = baixar(t)
            (destino / f"{t}.json").write_text(
                json.dumps(linhas, ensure_ascii=False, indent=1, default=str),
                encoding="utf-8")
            resumo["tabelas"][t] = len(linhas)
            total += len(linhas)
            print(f"  {t:20} {len(linhas):6} registros")
        except Exception as e:
            resumo["tabelas"][t] = f"ERRO: {e}"
            print(f"  {t:20} ERRO: {str(e)[:60]}")

    (destino / "_resumo.json").write_text(
        json.dumps(resumo, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n  TOTAL: {total} registros em {len(TABELAS)} tabelas")
    print(f"  Resumo: {destino / '_resumo.json'}")


if __name__ == "__main__":
    main()
