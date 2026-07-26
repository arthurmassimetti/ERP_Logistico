"""
Painel de linha de comando — ver / criar / editar registros no banco.
Rodar:  python painel.py
"""
import json
from db import TABELAS, listar, inserir, atualizar, chave_de


def _parse_valor(v: str):
    """Converte texto digitado pro tipo mais provável (numero/booleano/nulo)."""
    if v == "":
        return None
    baixo = v.lower()
    if baixo == "null":
        return None
    if baixo == "true":
        return True
    if baixo == "false":
        return False
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        pass
    return v  # mantém como texto (datas "2026-07-20", uuid, nomes...)


def _ler_campos(exemplo: str) -> dict:
    print(f"Digite campo=valor, um por linha (ex.: {exemplo}). Linha vazia pra terminar.")
    dados = {}
    while True:
        linha = input("> ").strip()
        if not linha:
            break
        if "=" not in linha:
            print("  formato errado, use campo=valor")
            continue
        campo, valor = linha.split("=", 1)
        dados[campo.strip()] = _parse_valor(valor.strip())
    return dados


def escolher_tabela() -> str:
    print("\nTabelas:")
    for i, t in enumerate(TABELAS, 1):
        print(f"  {i:2}) {t}")
    while True:
        escolha = input("Número da tabela: ").strip()
        if escolha.isdigit() and 1 <= int(escolha) <= len(TABELAS):
            return TABELAS[int(escolha) - 1]
        print("  opção inválida")


def acao_ver():
    tabela = escolher_tabela()
    linhas = listar(tabela)
    if not linhas:
        print("(nenhum registro)")
        return
    for linha in linhas:
        print(json.dumps(linha, indent=2, ensure_ascii=False, default=str))


def acao_criar():
    tabela = escolher_tabela()
    dados = _ler_campos("nome=Fulano de Tal")
    if not dados:
        print("nada digitado, cancelado")
        return
    criado = inserir(tabela, dados)
    print("Criado:")
    print(json.dumps(criado, indent=2, ensure_ascii=False, default=str))


def acao_editar():
    tabela = escolher_tabela()
    chave = chave_de(tabela)
    valor_chave = input(f"Valor de '{chave}' do registro a editar: ").strip()
    dados = _ler_campos("valor=1500.50")
    if not dados:
        print("nada digitado, cancelado")
        return
    atualizado = atualizar(tabela, valor_chave, dados)
    if not atualizado:
        print(f"nenhum registro encontrado com {chave}={valor_chave}")
        return
    print("Atualizado:")
    print(json.dumps(atualizado, indent=2, ensure_ascii=False, default=str))


def main():
    acoes = {"1": acao_ver, "2": acao_criar, "3": acao_editar}
    while True:
        print("""
=== PHORTE AGUIAR — painel (linha de comando) ===
1) Ver registros
2) Criar registro
3) Editar registro
0) Sair
""")
        escolha = input("Escolha: ").strip()
        if escolha == "0":
            break
        acao = acoes.get(escolha)
        if not acao:
            print("opção inválida")
            continue
        try:
            acao()
        except Exception as e:
            print(f"Erro: {e}")


if __name__ == "__main__":
    main()
