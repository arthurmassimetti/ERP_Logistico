"""
Remove os registros de TESTE deixados em producao durante a validacao das
funcionalidades novas (checklist, ocorrencia, ordem de manutencao).

Criterio conservador — so apaga o que tem marca inequivoca de teste:
  - manutencoes  : os_nf comecando com 'OM-' E valor 0 E criada em 26/07/2026
                   (a outra manutencao com valor 0 e REAL, migrada da planilha
                    em 23/07 com os_nf=100 — essa NAO e tocada)
  - ordens_manutencao / ocorrencias / checklists : registros do motorista de
                   teste 'Lucas Aguiar' criados em 26/07/2026

NAO apaga: o motorista 'Operacional' nem o perfil 'edimilson' — sao o login
operacional de verdade (o sistema exige um registro de motorista para
vincular qualquer login, inclusive de nao-motorista).

Uso:
    python limpar_teste.py --dry-run   # so mostra o que faria
    python limpar_teste.py             # apaga

Rode backup_banco.py antes.
"""
import argparse
from db import supabase

DATA_TESTE = "2026-07-26"
MOTORISTA_TESTE = "Lucas Aguiar"


def alvos():
    """Localiza os registros de teste. Retorna dict tabela -> lista de (id, rotulo)."""
    out = {}

    mot = supabase.table("motoristas").select("id").eq("nome", MOTORISTA_TESTE).execute().data
    mid = mot[0]["id"] if mot else None

    # ordens de manutencao de teste (as que geraram manutencao com os_nf OM-)
    ordens = supabase.table("ordens_manutencao").select("*").execute().data
    out["ordens_manutencao"] = [
        (o["id"], f"OM #{o['numero']} · {o['veiculo_placa']} · {str(o['servico_realizado'])[:24]!r}")
        for o in ordens if str(o.get("aberta_em", ""))[:10] == DATA_TESTE
    ]

    # manutencoes geradas por essas ordens: os_nf 'OM-<numero>'
    numeros = {str(o["numero"]) for o in ordens if str(o.get("aberta_em", ""))[:10] == DATA_TESTE}
    manut = supabase.table("manutencoes").select("*").eq("data", DATA_TESTE).execute().data
    out["manutencoes"] = [
        (m["id"], f"{m['veiculo_placa']} · {str(m['servico'])[:24]!r} · os_nf={m['os_nf']}")
        for m in manut
        if m.get("os_nf") and str(m["os_nf"]).startswith("OM-")
        and str(m["os_nf"])[3:] in numeros
    ]

    if mid:
        oc = supabase.table("ocorrencias").select("*").eq("motorista_id", mid).execute().data
        out["ocorrencias"] = [
            (o["id"], f"{o['tipo']}/{o['urgencia']} · {str(o['descricao'])[:34]!r}")
            for o in oc if str(o.get("criado_em", ""))[:10] == DATA_TESTE
        ]
        ck = supabase.table("checklists").select("*").eq("motorista_id", mid).execute().data
        out["checklists"] = [
            (c["id"], f"{c['data']} · {c['veiculo_placa']}")
            for c in ck if str(c.get("data", ""))[:10] == DATA_TESTE
        ]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="só mostra, não apaga")
    args = ap.parse_args()

    alvo = alvos()
    total = sum(len(v) for v in alvo.values())
    if not total:
        print("Nada de teste encontrado — banco já está limpo.")
        return

    print("Registros de teste encontrados:\n")
    for tabela, itens in alvo.items():
        if not itens:
            continue
        print(f"  {tabela} ({len(itens)}):")
        for _, rotulo in itens:
            print(f"     - {rotulo}")
    print(f"\n  TOTAL: {total} registros")

    if args.dry_run:
        print("\n--dry-run: nada foi apagado.")
        return

    # ordem importa: a ordem de manutencao referencia manutencao e ocorrencia,
    # entao ela sai primeiro para nao violar chave estrangeira.
    print()
    for tabela in ("ordens_manutencao", "manutencoes", "ocorrencias", "checklists"):
        for id_, rotulo in alvo.get(tabela, []):
            supabase.table(tabela).delete().eq("id", id_).execute()
            print(f"  apagado {tabela}: {rotulo}")

    print("\nContagens depois da limpeza:")
    for t in ("manutencoes", "ordens_manutencao", "ocorrencias", "checklists"):
        c = supabase.table(t).select("id", count="exact").limit(1).execute().count
        print(f"  {t:20} {c}")


if __name__ == "__main__":
    main()
