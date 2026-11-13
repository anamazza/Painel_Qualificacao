# -*- coding: utf-8 -*-
"""Lê a planilha de qualificação (classificação trimestral das práticas de atenção e gestão) e gera os dados do painel.

    py build_dados.py                      usa a planilha .xlsx mais recente da pasta fonte/
    py build_dados.py "caminho\\planilha.xlsx"

Saídas: dados_qualificacao.js (const DADOS, embutido no painel pelo montar_painel.py) e relatorio_leitura.md
(o que foi lido, o que ficou sem informação e o que foi corrigido na leitura).

Regras (decisões da coordenação em 11/11/2026):
  1. Só as abas regionais são lidas, serviço a serviço. As abas "Brasil" e "Por Região" e as linhas de total,
     percentual e média da planilha NÃO são usadas: o painel refaz todas as contagens.
  2. "SI" e célula em branco têm o mesmo significado: sem informação.
  3. Marcação com erro de digitação que contenha um único "1" (ex.: "~1") é lida como "1" e fica registrada.
  4. Classificação = a coluna de nível que tem a marcação "1" em cada avaliação. Duas marcações na mesma avaliação
     ou qualquer outro valor ficam como sem informação e aparecem no relatório.
A lista de indicadores (nomes curtos, eixos e dimensões) vem de indicadores.csv, transcrita do documento
"LISTA DE INDICADORES" da coordenação; a identificação de cada serviço (CNES) vem de servicos_cnes.csv."""
import csv, glob, json, os, re, sys
from collections import Counter, defaultdict
from datetime import date, datetime

from openpyxl import load_workbook

BASE = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding="utf-8")

# aba da planilha -> rótulo do grupo (como na aba "Por Região") e região do país
ABAS = [
    ("DF GO MT MS", "Centro-Oeste", "Centro-Oeste"),
    ("AM TO PA", "Norte (AM, PA, TO)", "Norte"),
    ("AP AC RR RO", "Norte (AP, AC, RR, RO)", "Norte"),
    ("CE MA PI", "Nordeste (CE, MA, PI)", "Nordeste"),
    ("BA PE RN", "Nordeste (BA, PE, RN)", "Nordeste"),
    ("AL PB SE", "Nordeste (AL, SE, PB)", "Nordeste"),
    ("ES MG RJ SP", "Sudeste", "Sudeste"),
    ("PR RS SC", "Sul", "Sul"),
]
# níveis, na ordem das colunas da planilha; cores do documento "LISTA DE INDICADORES" (cinza, vermelho, laranja, verde, azul)
NIVEIS = [
    {"id": "nsa", "rot": "Não se Aplica", "cod": "NA", "cor": "#AEB6B2", "planilha": "Não se Aplica"},
    {"id": "ni", "rot": "Não Iniciado", "cod": "NI", "cor": "#C0392B", "planilha": "Não Iniciado"},
    {"id": "int", "rot": "Intermediário", "cod": "I", "cor": "#E8912D", "planilha": "Intermediario"},
    {"id": "av", "rot": "Avançado", "cod": "A", "cor": "#279261", "planilha": "Avançado"},
    {"id": "qual", "rot": "Qualificado", "cod": "Q", "cor": "#1F5F99", "planilha": "Qualificado"},
]
# avaliações: período conforme o documento "LISTA DE INDICADORES"; coluna inicial de cada uma nas abas regionais
AVALIACOES = [
    {"n": 1, "rot": "1ª avaliação", "periodo": "4º trim./2025", "meses": "outubro a dezembro de 2025", "col": 7},
    {"n": 2, "rot": "2ª avaliação", "periodo": "1º trim./2026", "meses": "janeiro a março de 2026", "col": 13},
    {"n": 3, "rot": "3ª avaliação", "periodo": "2º trim./2026", "meses": "abril a junho de 2026", "col": 19},
    {"n": 4, "rot": "4ª avaliação", "periodo": "3º trim./2026", "meses": "julho a setembro de 2026", "col": 25},
    {"n": 5, "rot": "5ª avaliação", "periodo": "4º trim./2026", "meses": "outubro a dezembro de 2026", "col": 31},
]
EIXOS = [("obst", "Atenção Obstétrica"), ("neo", "Atenção Neonatal"), ("gestao", "Gestão")]


def limpa(s):
    return re.sub(r"\s+", " ", str(s or "").replace("\t", " ")).strip()


def eh_formula(v):
    return isinstance(v, str) and v.startswith("=")


def achar_planilha():
    if len(sys.argv) > 1:
        return sys.argv[1]
    arqs = [a for a in glob.glob(os.path.join(BASE, "fonte", "*.xlsx")) if not os.path.basename(a).startswith("~$")]
    if not arqs:
        sys.exit("ERRO: nenhuma planilha .xlsx em fonte/ (ou informe o caminho como argumento)")
    return max(arqs, key=os.path.getmtime)


def ler_csv(nome):
    with open(os.path.join(BASE, nome), encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh, delimiter=";"))


def blocos(ws, wsf):
    """Indicadores da aba, na ordem: [{eixo, dim, ind, linhas[], total}], lidos direto das células.
    Linha de serviço = coluna E preenchida, coluna D diferente de "Total" e sem fórmula na coluna H."""
    eixo = dim = atual = None
    em_total = False
    out = []
    for r in range(3, ws.max_row + 1):
        a, b, c, d, e = (ws.cell(r, k).value for k in (1, 2, 3, 4, 5))
        if a:
            eixo = limpa(a)
        if b:
            dim = limpa(b)
        if c:
            if limpa(c) == "Total":          # bloco de total da dimensão: ignorado
                em_total, atual = True, None
                continue
            em_total = False
            atual = {"eixo": eixo, "dim": dim, "ind": limpa(c), "linhas": [], "total": None}
            out.append(atual)
        if em_total or atual is None:
            continue
        if e and limpa(d) != "Total" and not eh_formula(wsf.cell(r, 8).value):
            atual["linhas"].append(r)
        elif limpa(d) == "Total" and atual["total"] is None:
            atual["total"] = r
    return out


def ler_celulas(cel):
    """5 células de uma avaliação -> (nível 0-4 ou None, origem, correção ou None, anomalia ou None)."""
    marcas, si, corr, anom = [], False, None, None
    for k, v in enumerate(cel):
        if v is None or (isinstance(v, str) and not v.strip()):
            continue
        if v in (1, 1.0) or (isinstance(v, str) and v.strip() == "1"):
            marcas.append(k)
        elif isinstance(v, str) and v.strip().upper() == "SI":
            si = True
        elif isinstance(v, str) and re.fullmatch(r"[^0-9A-Za-zÀ-ÿ]*1[^0-9A-Za-zÀ-ÿ]*", v.strip()):
            marcas.append(k)
            corr = v
        else:
            anom = f"valor inesperado {v!r}"
    if len(marcas) > 1:
        return None, "anomalia", None, "mais de uma marcação na mesma avaliação"
    if anom:
        return None, "anomalia", None, anom
    if len(marcas) == 1:
        return marcas[0], "nivel", corr, None
    return None, ("SI" if si else "branco"), None, None


def main():
    caminho = achar_planilha()
    print("planilha:", caminho)
    wb = load_workbook(caminho, data_only=True)
    wf = load_workbook(caminho, data_only=False)
    faltam = [a for a, _, _ in ABAS if a not in wb.sheetnames]
    if faltam:
        sys.exit(f"ERRO: abas regionais ausentes na planilha: {faltam}")

    ind_csv = ler_csv("indicadores.csv")
    assert len(ind_csv) == 40, "indicadores.csv deve ter 40 linhas"
    por_planilha = {int(x["n_planilha"]): x for x in ind_csv}          # posição na planilha -> indicador do painel
    serv_csv = {(x["aba"], x["uf"], x["servico_planilha"]): x for x in ler_csv("servicos_cnes.csv")}

    # eixos, dimensões e indicadores (ordem do documento)
    dimensoes, indicadores = [], []
    eixo_id = {rot: i for i, rot in EIXOS}
    for x in ind_csv:
        e = eixo_id[x["eixo"]]
        if not dimensoes or dimensoes[-1]["rot"] != x["dimensao"] or dimensoes[-1]["eixo"] != e:
            dimensoes.append({"id": f"d{len(dimensoes) + 1}", "eixo": e, "rot": x["dimensao"]})
        indicadores.append({"id": int(x["id"]), "eixo": e, "dim": dimensoes[-1]["id"], "rot": x["indicador"],
                            "texto": x["texto_planilha"], "nPlanilha": int(x["n_planilha"])})
    idx_painel = {i["nPlanilha"]: k for k, i in enumerate(indicadores)}  # posição na planilha -> índice no painel

    maternidades, correcoes, anomalias, divergencias = {}, [], [], []
    origem = Counter()                       # (aba, avaliação, origem) -> células
    for aba, rot_grupo, regiao in ABAS:
        ws, wsf = wb[aba], wf[aba]
        # cabeçalhos: garante que as colunas continuam onde se espera
        for av in AVALIACOES:
            cab = [limpa(ws.cell(2, av["col"] + k).value) for k in range(5)]
            if cab != [n["planilha"] for n in NIVEIS]:
                sys.exit(f"ERRO: aba {aba}, avaliação {av['n']}: cabeçalho de níveis inesperado na coluna {av['col']}: {cab}")
        bl = blocos(ws, wsf)
        if len(bl) != 40:
            sys.exit(f"ERRO: aba {aba}: {len(bl)} indicadores encontrados (esperado 40)")
        servicos = [(limpa(ws.cell(r, 4).value), limpa(ws.cell(r, 5).value)) for r in bl[0]["linhas"]]
        for uf, s in servicos:
            chave = (aba, uf, s)
            if chave not in serv_csv:
                sys.exit(f"ERRO: serviço sem CNES em servicos_cnes.csv: {chave}")
            m = serv_csv[chave]
            maternidades[chave] = {"cnes": m["cnes"], "nome": m["nome_painel"], "nomePlanilha": s, "uf": uf, "regiao": m["regiao"],
                                   "municipio": m["municipio"], "aba": aba, "grupo": rot_grupo,
                                   "lat": float(m["lat"]) if m["lat"] else None, "lon": float(m["lon"]) if m["lon"] else None,
                                   "c": [[None] * 5 for _ in range(40)]}
        for pos, b in enumerate(bl, 1):
            alvo = por_planilha[pos]
            if limpa(alvo["texto_planilha"]) != b["ind"]:
                sys.exit(f"ERRO: aba {aba}: indicador {pos} mudou de texto: {b['ind']!r} (esperado {alvo['texto_planilha']!r})")
            atual = [(limpa(ws.cell(r, 4).value), limpa(ws.cell(r, 5).value)) for r in b["linhas"]]
            if atual != servicos:
                sys.exit(f"ERRO: aba {aba}: o indicador {pos} não lista os mesmos serviços, na mesma ordem, do primeiro indicador")
            conta = Counter()
            for r, (uf, s) in zip(b["linhas"], servicos):
                for a, av in enumerate(AVALIACOES):
                    cel = [ws.cell(r, av["col"] + k).value for k in range(5)]
                    nivel, org, corr, anom = ler_celulas(cel)
                    origem[(aba, a, org)] += 1
                    maternidades[(aba, uf, s)]["c"][idx_painel[pos]][a] = nivel
                    if nivel is not None:
                        conta[(a, nivel)] += 1
                    reg = {"aba": aba, "linha": r, "avaliacao": av["n"], "servico": s, "uf": uf, "indicador": alvo["indicador"]}
                    if corr:
                        correcoes.append({**reg, "lido": corr, "usado": NIVEIS[nivel]["rot"]})
                    if anom:
                        anomalias.append({**reg, "motivo": anom, "celulas": [str(v) for v in cel]})
            # conferência com a linha "Total" do indicador na própria planilha (valor em cache)
            if b["total"]:
                for a, av in enumerate(AVALIACOES):
                    for k in range(5):
                        v = ws.cell(b["total"], av["col"] + k).value
                        if isinstance(v, (int, float)) and int(v) != conta.get((a, k), 0):
                            divergencias.append({"aba": aba, "linha": b["total"], "avaliacao": av["n"], "indicador": alvo["indicador"],
                                                 "nivel": NIVEIS[k]["rot"], "planilha": int(v), "recontagem": conta.get((a, k), 0)})

    mats = sorted(maternidades.values(), key=lambda m: (m["uf"], m["nome"]))
    assert len({m["cnes"] for m in mats}) == len(mats), "CNES repetido em servicos_cnes.csv"
    # resumo por avaliação
    resumo = []
    for a, av in enumerate(AVALIACOES):
        dist = Counter(m["c"][i][a] for m in mats for i in range(40))
        cls = sum(v for k, v in dist.items() if k is not None)
        resumo.append({"n": av["n"], "classificados": cls, "semInformacao": dist.get(None, 0), "niveis": [dist.get(k, 0) for k in range(5)]})
    for av, r in zip(AVALIACOES, resumo):
        av["realizada"] = r["classificados"] > 0

    stat = os.stat(caminho)
    DADOS = {
        "painel": "qualificacao",
        "geradoEm": date.today().isoformat(),
        "fonte": {"arquivo": os.path.basename(caminho), "modificadoEm": datetime.fromtimestamp(stat.st_mtime).date().isoformat(),
                  "lista": "LISTA DE INDICADORES.docx"},
        "niveis": [{k: n[k] for k in ("id", "rot", "cod", "cor")} for n in NIVEIS],
        "avaliacoes": [{k: av[k] for k in ("n", "rot", "periodo", "meses", "realizada")} for av in AVALIACOES],
        "eixos": [{"id": i, "rot": r} for i, r in EIXOS],
        "dimensoes": dimensoes,
        "indicadores": indicadores,
        "grupos": [{"aba": a, "rot": r, "regiao": g} for a, r, g in ABAS],
        "maternidades": mats,
        "resumo": resumo,
        "correcoes": correcoes,
        "anomalias": anomalias,
    }
    with open(os.path.join(BASE, "dados_qualificacao.js"), "w", encoding="utf-8") as fh:
        fh.write("/* gerado por build_dados.py; não editar à mão */\n")
        geo = os.path.join(BASE, "geo_uf.json")          # malha dos estados para o mapa (a mesma dos demais painéis)
        if os.path.exists(geo):
            fh.write("const GEO = " + open(geo, encoding="utf-8").read().strip() + ";\n")
        else:
            print("aviso: geo_uf.json não encontrado; o painel será montado sem o mapa")
        fh.write("const DADOS = ")
        json.dump(DADOS, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

    # ---------------- relatório de leitura ----------------
    L = [f"# Relatório de leitura da planilha de qualificação", "",
         f"- Planilha: `{os.path.basename(caminho)}` (arquivo modificado em {DADOS['fonte']['modificadoEm']})",
         f"- Leitura em {DADOS['geradoEm']} · {len(mats)} maternidades em {len({m['uf'] for m in mats})} UFs · 40 indicadores · 5 avaliações", "",
         "## Itens por avaliação (maternidade x indicador)", "",
         "| Avaliação | Período | Classificados | Sem informação | " + " | ".join(n["rot"] for n in NIVEIS) + " |",
         "|---|---|---:|---:|" + "---:|" * 5]
    for av, r in zip(AVALIACOES, resumo):
        L.append(f"| {av['rot']} | {av['periodo']} | {r['classificados']} | {r['semInformacao']} | " + " | ".join(str(v) for v in r["niveis"]) + " |")
    L += ["", "## Sem informação por aba (\"SI\" e em branco), por avaliação", "",
          "| Aba | Serviços | " + " | ".join(f"{av['n']}ª: SI / branco" for av in AVALIACOES) + " |", "|---|---:|" + "---:|" * 5]
    for aba, _, _ in ABAS:
        ns = sum(1 for m in mats if m["aba"] == aba)
        L.append(f"| {aba} | {ns} | " + " | ".join(f"{origem.get((aba, a, 'SI'), 0)} / {origem.get((aba, a, 'branco'), 0)}" for a in range(5)) + " |")
    L += ["", "## Indicadores sem nenhuma classificação, por aba (última avaliação realizada)", ""]
    ult = max((a for a, av in enumerate(AVALIACOES) if av["realizada"]), default=0)
    for aba, _, _ in ABAS:
        sem = [i["rot"] for k, i in enumerate(indicadores) if all(m["c"][k][ult] is None for m in mats if m["aba"] == aba)]
        L.append(f"- **{aba}**: {len(sem)} de 40" + (": " + "; ".join(sem) if sem else ""))
    L += ["", "## Marcações corrigidas na leitura", ""]
    L += [f"- Aba {c['aba']}, linha {c['linha']}, {c['avaliacao']}ª avaliação, {c['servico']} ({c['uf']}), indicador \"{c['indicador']}\": "
          f"lido `{c['lido']}`, usado como \"{c['usado']}\"." for c in correcoes] or ["- Nenhuma."]
    L += ["", "## Células não aproveitadas (ficaram como sem informação)", ""]
    L += [f"- Aba {c['aba']}, linha {c['linha']}, {c['avaliacao']}ª avaliação, {c['servico']} ({c['uf']}), \"{c['indicador']}\": {c['motivo']} {c['celulas']}." for c in anomalias] or ["- Nenhuma."]
    L += ["", "## Linhas \"Total\" de indicador da planilha que diferem da recontagem", ""]
    L += [f"- Aba {d['aba']}, linha {d['linha']}, {d['avaliacao']}ª avaliação, \"{d['indicador']}\", {d['nivel']}: planilha {d['planilha']}, recontagem {d['recontagem']}." for d in divergencias] or ["- Nenhuma."]
    with open(os.path.join(BASE, "relatorio_leitura.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")

    print(f"dados_qualificacao.js gravado: {len(mats)} maternidades, {len({m['uf'] for m in mats})} UFs")
    for av, r in zip(AVALIACOES, resumo):
        print(f"  {av['rot']} ({av['periodo']}): classificados {r['classificados']} | sem informação {r['semInformacao']} | níveis {r['niveis']}")
    print(f"  correções: {len(correcoes)} | células não aproveitadas: {len(anomalias)} | totais da planilha divergentes: {len(divergencias)}")
    return DADOS


if __name__ == "__main__":
    main()
