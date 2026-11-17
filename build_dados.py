# -*- coding: utf-8 -*-
"""Lê a planilha de qualificação (classificação trimestral das práticas de atenção e gestão) e gera os dados do painel.

    py build_dados.py                      usa a planilha .xlsx mais recente da pasta fonte/
    py build_dados.py "caminho\\planilha.xlsx"

Saídas: dados_qualificacao.js (const DADOS, embutido no painel pelo montar_painel.py) e relatorio_leitura.md
(o que foi lido, o que ficou sem informação e o que foi corrigido na leitura).

Regras (decisões da coordenação em 11/11/2026, com os ajustes de 16/11/2026):
  1. Só as abas regionais são lidas, serviço a serviço. As abas "Brasil" e "Por Região" e as linhas de total,
     percentual e média da planilha NÃO são usadas: o painel refaz todas as contagens.
  2. "SI" e célula em branco têm o mesmo significado: sem informação.
  3. Marcação com erro de digitação que contenha um único "1" (ex.: "~1") é lida como "1" e fica registrada.
  4. Classificação = a coluna de nível que tem a marcação "1" em cada avaliação. Duas marcações na mesma avaliação
     ou qualquer outro valor ficam como sem informação e aparecem no relatório.
  5. (16/11/2026) A primeira coluna de classificação é a linha de base (jan/2026) e as seguintes são a 1ª, a 2ª, a 3ª
     e a 4ª avaliação (1º ao 4º trimestre de 2026). O painel não separa mais os grupos de estados das abas: as abas
     servem só para a leitura. O indicador "M&A" da dimensão Vinculação saiu do instrumento; se ainda constar de
     alguma aba, é ignorado e fica registrado no relatório. As marcações podem vir de fórmula (valor importado).
  6. (16/11/2026) A descrição de cada nível, por indicador, vem da aba "Indicadores" da planilha.
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
# (16/11/2026, grupo técnico da coordenação) a primeira coluna é a linha de base; as demais, 1ª a 4ª avaliação.
# "ref" é a forma usada no meio de uma frase; "sigla", a forma curta dos botões e cabeçalhos; "arq", a dos nomes de arquivo.
AVALIACOES = [
    {"n": 0, "rot": "Linha de base", "ref": "linha de base", "sigla": "Linha de base", "arq": "linha_de_base", "periodo": "jan/2026", "meses": "situação registrada de outubro a dezembro de 2025", "col": 7},
    {"n": 1, "rot": "1ª avaliação", "ref": "1ª avaliação", "sigla": "1ª", "arq": "1a_avaliacao", "periodo": "1º trim./2026", "meses": "janeiro a março de 2026", "col": 13},
    {"n": 2, "rot": "2ª avaliação", "ref": "2ª avaliação", "sigla": "2ª", "arq": "2a_avaliacao", "periodo": "2º trim./2026", "meses": "abril a junho de 2026", "col": 19},
    {"n": 3, "rot": "3ª avaliação", "ref": "3ª avaliação", "sigla": "3ª", "arq": "3a_avaliacao", "periodo": "3º trim./2026", "meses": "julho a setembro de 2026", "col": 25},
    {"n": 4, "rot": "4ª avaliação", "ref": "4ª avaliação", "sigla": "4ª", "arq": "4a_avaliacao", "periodo": "4º trim./2026", "meses": "outubro a dezembro de 2026", "col": 31},
]
N_IND = 39
# indicador retirado do instrumento: (início do rótulo da dimensão, texto do indicador)
RETIRADOS = [("2. Vinculação", "M&A")]
# aba "Indicadores": grupos (coluna A), na ordem, e a posição na planilha (n_planilha) de cada pergunta (coluna B) do
# grupo; None = pergunta sem indicador correspondente nas abas regionais (as marcadas como sugestão)
CRITERIOS_ABA = "Indicadores"
CRITERIOS_GRUPOS = [
    ("Cuidado às Urgências e Emergências Obstétricas", [1, 2, 3, 4, 5, 6]),
    ("Cuidado ao Puerpério e Recém-Nascido no Alojamento Conjunto", [7, 8]),
    ("Estratégias para redução de cesarianas", [9, 10, 11, 12, 13]),
    ("Cuidado ao Luto Materno e Parental", [14, 15, None, None, None]),
    ("Atenção Integral às Mulheres em Situação de Violência Sexual", [17, 18, 19, 20, None]),
    ("Qualificação do Cuidado Progressivo em Unidade Neonatal", [36, 37, 38, 39]),
    ("Gestão Colegiada Perinatal", [21, 22, 23, 24]),
    ("Vinculação da Gestante ao local de parto", [25, 26, 27]),
    ("Infraestrutura", [28, 29, 30, 31, 32]),
    ("Monitoramento do Cuidado Obstétrico e Neonatal", []),
]
ROT_NIVEL_CRITERIO = ["não iniciado", "intermediário", "avançado", "qualificado"]
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
    Linha de serviço = coluna E preenchida com texto digitado (não fórmula) e coluna D diferente de "Total".
    As marcações podem vir de fórmula (valores importados); as linhas de total têm a coluna E vazia."""
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
        if e and limpa(d) != "Total" and not eh_formula(wsf.cell(r, 5).value):
            atual["linhas"].append(r)
        elif limpa(d) == "Total" and atual["total"] is None:
            atual["total"] = r
    return out


def ler_criterios(wb):
    """Aba "Indicadores": {n_planilha: {"pergunta": texto, "niveis": [4 textos] ou None}} e a lista das perguntas sem
    indicador correspondente. Para se a estrutura da aba mudar."""
    if CRITERIOS_ABA not in wb.sheetnames:
        sys.exit(f'ERRO: a planilha não tem a aba "{CRITERIOS_ABA}"')
    ws = wb[CRITERIOS_ABA]
    grupos, atual, perg = [], None, None
    for r in range(1, ws.max_row + 1):
        a, b, c = (ws.cell(r, k).value for k in (1, 2, 3))
        if a and limpa(a):
            atual = {"rot": limpa(a), "perguntas": []}
            grupos.append(atual)
            perg = None
        if atual is None or not b or not limpa(b):
            continue
        tb = limpa(b)
        if tb.startswith("-"):
            nome = tb.strip("-: ").lower()
            if perg is None or nome not in ROT_NIVEL_CRITERIO:
                sys.exit(f'ERRO: aba "{CRITERIOS_ABA}", linha {r}: nível inesperado {tb!r}')
            perg["niveis"][ROT_NIVEL_CRITERIO.index(nome)] = limpa(c).lstrip(": ").strip() if c else ""
        else:
            perg = {"pergunta": tb, "linha": r, "niveis": [None] * 4}
            atual["perguntas"].append(perg)
    if len(grupos) != len(CRITERIOS_GRUPOS):
        sys.exit(f'ERRO: aba "{CRITERIOS_ABA}": {len(grupos)} grupos (esperado {len(CRITERIOS_GRUPOS)})')
    out, sem_par = {}, []
    for g, (ini, pos) in zip(grupos, CRITERIOS_GRUPOS):
        if not g["rot"].startswith(ini):
            sys.exit(f'ERRO: aba "{CRITERIOS_ABA}": grupo {g["rot"]!r} (esperado {ini!r})')
        if len(g["perguntas"]) != len(pos):
            sys.exit(f'ERRO: aba "{CRITERIOS_ABA}", grupo {ini!r}: {len(g["perguntas"])} perguntas (esperado {len(pos)})')
        for p, n in zip(g["perguntas"], pos):
            if any(v is None for v in p["niveis"]):
                sys.exit(f'ERRO: aba "{CRITERIOS_ABA}", linha {p["linha"]}: faltam linhas de nível')
            niveis = p["niveis"] if all(p["niveis"]) else None
            if n is None:
                sem_par.append({"grupo": g["rot"], "pergunta": p["pergunta"], "comTexto": niveis is not None})
            else:
                out[n] = {"pergunta": p["pergunta"], "niveis": niveis, "parcial": niveis is None and any(p["niveis"])}
    return out, sem_par


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
    assert len(ind_csv) == N_IND, f"indicadores.csv deve ter {N_IND} linhas"
    por_planilha = {int(x["n_planilha"]): x for x in ind_csv}          # posição na planilha -> indicador do painel
    serv_csv = {(x["aba"], x["uf"], x["servico_planilha"]): x for x in ler_csv("servicos_cnes.csv")}
    terr = {x["cnes"]: x for x in ler_csv("territorio_saude.csv")}      # região e macrorregião de saúde de cada maternidade
    criterios, criterios_sem_par = ler_criterios(wb)

    # eixos, dimensões e indicadores (ordem do documento)
    dimensoes, indicadores = [], []
    eixo_id = {rot: i for i, rot in EIXOS}
    for x in ind_csv:
        e = eixo_id[x["eixo"]]
        if not dimensoes or dimensoes[-1]["rot"] != x["dimensao"] or dimensoes[-1]["eixo"] != e:
            dimensoes.append({"id": f"d{len(dimensoes) + 1}", "eixo": e, "rot": x["dimensao"]})
        cr = criterios.get(int(x["n_planilha"]))
        indicadores.append({"id": int(x["id"]), "eixo": e, "dim": dimensoes[-1]["id"], "rot": x["indicador"],
                            "texto": x["texto_planilha"], "nPlanilha": int(x["n_planilha"]),
                            "pergunta": cr["pergunta"] if cr else None, "criterios": cr["niveis"] if cr else None})
    idx_painel = {i["nPlanilha"]: k for k, i in enumerate(indicadores)}  # posição na planilha -> índice no painel

    maternidades, correcoes, anomalias, divergencias, ignorados = {}, [], [], [], []
    origem = Counter()                       # (aba, avaliação, origem) -> células
    for aba, rot_grupo, regiao in ABAS:
        ws, wsf = wb[aba], wf[aba]
        # cabeçalhos: garante que as colunas continuam onde se espera
        for av in AVALIACOES:
            cab = [limpa(ws.cell(2, av["col"] + k).value) for k in range(5)]
            if cab != [n["planilha"] for n in NIVEIS]:
                sys.exit(f"ERRO: aba {aba}, avaliação {av['n']}: cabeçalho de níveis inesperado na coluna {av['col']}: {cab}")
        bl = blocos(ws, wsf)
        fora = [b for b in bl if any(b["dim"].startswith(d) and b["ind"] == i for d, i in RETIRADOS)]
        for b in fora:
            marcas = sum(1 for r in b["linhas"] for av in AVALIACOES if ler_celulas([ws.cell(r, av["col"] + k).value for k in range(5)])[0] is not None)
            ignorados.append({"aba": aba, "indicador": b["ind"], "dimensao": b["dim"], "linha": b["linhas"][0] if b["linhas"] else None, "classificacoes": marcas})
        bl = [b for b in bl if b not in fora]
        if len(bl) != N_IND:
            sys.exit(f"ERRO: aba {aba}: {len(bl)} indicadores encontrados (esperado {N_IND})")
        servicos = [(limpa(ws.cell(r, 4).value), limpa(ws.cell(r, 5).value)) for r in bl[0]["linhas"]]
        for uf, s in servicos:
            chave = (aba, uf, s)
            if chave not in serv_csv:
                sys.exit(f"ERRO: serviço sem CNES em servicos_cnes.csv: {chave}")
            m = serv_csv[chave]
            if m["cnes"] not in terr:
                sys.exit(f"ERRO: maternidade sem região de saúde em territorio_saude.csv: {m['cnes']}")
            tr = terr[m["cnes"]]
            maternidades[chave] = {"cnes": m["cnes"], "nome": m["nome_painel"], "nomePlanilha": s, "uf": uf, "regiao": m["regiao"],
                                   "municipio": m["municipio"], "aba": aba,
                                   "rs": tr["regiao_saude"], "rsNome": tr["regiao_saude_nome"], "macro": tr["macrorregiao"], "macroNome": tr["macrorregiao_nome"],
                                   "lat": float(m["lat"]) if m["lat"] else None, "lon": float(m["lon"]) if m["lon"] else None,
                                   "c": [[None] * 5 for _ in range(N_IND)]}
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
        dist = Counter(m["c"][i][a] for m in mats for i in range(N_IND))
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
        "avaliacoes": [{k: av[k] for k in ("n", "rot", "ref", "sigla", "arq", "periodo", "meses", "realizada")} for av in AVALIACOES],
        "eixos": [{"id": i, "rot": r} for i, r in EIXOS],
        "dimensoes": dimensoes,
        "indicadores": indicadores,
        "criteriosSemIndicador": criterios_sem_par,
        "maternidades": mats,
        "resumo": resumo,
        "correcoes": correcoes,
        "anomalias": anomalias,
    }
    with open(os.path.join(BASE, "dados_qualificacao.js"), "w", encoding="utf-8") as fh:
        fh.write("/* gerado por build_dados.py; não editar à mão */\n")
        geo = os.path.join(BASE, "geo_uf.json")          # malha dos estados para o mapa (a mesma dos demais painéis)
        if os.path.exists(geo):
            g = json.load(open(geo, encoding="utf-8"))
            gs = os.path.join(BASE, "geo_saude.json")    # regiões e macrorregiões de saúde (a mesma malha do Painel de Habilitações)
            if os.path.exists(gs):
                s = json.load(open(gs, encoding="utf-8"))
                g["macro"], g["rs"] = s["macro"], s["rs"]
            else:
                print("aviso: geo_saude.json não encontrado; o mapa ficará sem as regiões de saúde")
            fh.write("const GEO = " + json.dumps(g, ensure_ascii=False, separators=(",", ":")) + ";\n")
        else:
            print("aviso: geo_uf.json não encontrado; o painel será montado sem o mapa")
        fh.write("const DADOS = ")
        json.dump(DADOS, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

    # ---------------- relatório de leitura ----------------
    L = [f"# Relatório de leitura da planilha de qualificação", "",
         f"- Planilha: `{os.path.basename(caminho)}` (arquivo modificado em {DADOS['fonte']['modificadoEm']})",
         f"- Leitura em {DADOS['geradoEm']} · {len(mats)} maternidades em {len({m['uf'] for m in mats})} UFs · {N_IND} indicadores · linha de base e 4 avaliações", "",
         "## Itens por avaliação (maternidade x indicador)", "",
         "| Avaliação | Período | Classificados | Sem informação | " + " | ".join(n["rot"] for n in NIVEIS) + " |",
         "|---|---|---:|---:|" + "---:|" * 5]
    for av, r in zip(AVALIACOES, resumo):
        L.append(f"| {av['rot']} | {av['periodo']} | {r['classificados']} | {r['semInformacao']} | " + " | ".join(str(v) for v in r["niveis"]) + " |")
    L += ["", "## Sem informação por aba (\"SI\" e em branco), por avaliação", "",
          "| Aba | Serviços | " + " | ".join(f"{av['sigla']}: SI / branco" for av in AVALIACOES) + " |", "|---|---:|" + "---:|" * 5]
    for aba, _, _ in ABAS:
        ns = sum(1 for m in mats if m["aba"] == aba)
        L.append(f"| {aba} | {ns} | " + " | ".join(f"{origem.get((aba, a, 'SI'), 0)} / {origem.get((aba, a, 'branco'), 0)}" for a in range(5)) + " |")
    L += ["", "## Indicadores sem nenhuma classificação, por aba (última avaliação realizada)", ""]
    ult = max((a for a, av in enumerate(AVALIACOES) if av["realizada"]), default=0)
    for aba, _, _ in ABAS:
        sem = [i["rot"] for k, i in enumerate(indicadores) if all(m["c"][k][ult] is None for m in mats if m["aba"] == aba)]
        L.append(f"- **{aba}**: {len(sem)} de {N_IND}" + (": " + "; ".join(sem) if sem else ""))
    L += ["", "## Marcações corrigidas na leitura", ""]
    L += [f"- Aba {c['aba']}, linha {c['linha']}, coluna {c['avaliacao'] + 1} ({AVALIACOES[c['avaliacao']]['rot']}), {c['servico']} ({c['uf']}), indicador \"{c['indicador']}\": "
          f"lido `{c['lido']}`, usado como \"{c['usado']}\"." for c in correcoes] or ["- Nenhuma."]
    L += ["", "## Células não aproveitadas (ficaram como sem informação)", ""]
    L += [f"- Aba {c['aba']}, linha {c['linha']}, coluna {c['avaliacao'] + 1} ({AVALIACOES[c['avaliacao']]['rot']}), {c['servico']} ({c['uf']}), \"{c['indicador']}\": {c['motivo']} {c['celulas']}." for c in anomalias] or ["- Nenhuma."]
    L += ["", "## Linhas \"Total\" de indicador da planilha que diferem da recontagem", ""]
    L += [f"- Aba {d['aba']}, linha {d['linha']}, coluna {d['avaliacao'] + 1} ({AVALIACOES[d['avaliacao']]['rot']}), \"{d['indicador']}\", {d['nivel']}: planilha {d['planilha']}, recontagem {d['recontagem']}." for d in divergencias] or ["- Nenhuma."]
    L += ["", "## Indicadores retirados do instrumento que ainda constam de alguma aba (ignorados)", ""]
    L += [f"- Aba {g['aba']}, linha {g['linha']}: \"{g['indicador']}\" ({g['dimensao']}), com {g['classificacoes']} classificações registradas." for g in ignorados] or ["- Nenhum."]
    sem_txt = [i for i in indicadores if not i["criterios"]]
    L += ["", "## Descrição dos níveis (aba \"Indicadores\")", "",
          f"- Indicadores com a descrição dos quatro níveis: {N_IND - len(sem_txt)} de {N_IND}.",
          "- Sem descrição: " + ("; ".join(f"{i['id']}. {i['rot']}" for i in sem_txt) or "nenhum") + ".",
          "- Perguntas da aba sem indicador correspondente nas abas regionais: " + ("; ".join(f"{p['pergunta']} ({p['grupo']})" for p in criterios_sem_par) or "nenhuma") + "."]
    with open(os.path.join(BASE, "relatorio_leitura.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")

    print(f"dados_qualificacao.js gravado: {len(mats)} maternidades, {len({m['uf'] for m in mats})} UFs")
    for av, r in zip(AVALIACOES, resumo):
        print(f"  {av['rot']} ({av['periodo']}): classificados {r['classificados']} | sem informação {r['semInformacao']} | níveis {r['niveis']}")
    print(f"  correções: {len(correcoes)} | células não aproveitadas: {len(anomalias)} | totais da planilha divergentes: {len(divergencias)}")
    return DADOS


if __name__ == "__main__":
    main()
