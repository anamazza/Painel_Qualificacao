# -*- coding: utf-8 -*-
"""Monta o Painel de Qualificação em arquivo único: embute dados, app e logos no HTML e grava o carimbo de atualização.

    py montar_painel.py              usa o dados_qualificacao.js já gerado
    py montar_painel.py --ler        antes, relê a planilha de fonte/ (roda o build_dados.py)

Saída: Painel_Qualificacao_2026.html e index.html (idênticos, autocontidos), dados.json (JSON puro) e atualizacao.json."""
import base64, json, os, sys
from datetime import date

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
sys.stdout.reconfigure(encoding="utf-8")

if "--ler" in sys.argv:
    sys.argv = [a for a in sys.argv if a != "--ler"]
    import build_dados
    build_dados.main()

dados_js = open(os.path.join(BASE, "dados_qualificacao.js"), encoding="utf-8").read()
ini = dados_js.index("const DADOS = ") + len("const DADOS = ")
DADOS = json.JSONDecoder().raw_decode(dados_js, ini)[0]

html = open(os.path.join(BASE, "painel_base.html"), encoding="utf-8").read()
app = open(os.path.join(BASE, "painel_app.js"), encoding="utf-8").read()
for marca, conteudo in (('<script src="dados_qualificacao.js"></script>', dados_js), ('<script src="painel_app.js"></script>', app)):
    if marca not in html:
        sys.exit(f"ERRO: painel_base.html sem a marca {marca}")
    html = html.replace(marca, "<script>\n" + conteudo + "\n</script>")
b64 = base64.b64encode(open(os.path.join(BASE, "logos_institucionais.png"), "rb").read()).decode("ascii")
html = html.replace('src="logos_institucionais.png"', 'src="data:image/png;base64,' + b64 + '"')

for nome in ("Painel_Qualificacao_2026.html", "index.html"):
    with open(os.path.join(BASE, nome), "w", encoding="utf-8") as fh:
        fh.write(html)
with open(os.path.join(BASE, "dados.json"), "w", encoding="utf-8") as fh:
    json.dump(DADOS, fh, ensure_ascii=False, separators=(",", ":"))
realizadas = [a for a in DADOS["avaliacoes"] if a["realizada"]]
carimbo = {
    "painel": "qualificacao",
    "montado_em": date.today().isoformat(),
    "dados_gerados_em": DADOS["geradoEm"],
    "planilha": DADOS["fonte"]["arquivo"],
    "planilha_versao": DADOS["fonte"]["modificadoEm"],
    "unidades": len(DADOS["maternidades"]),
    "linha_de_base": DADOS["avaliacoes"][0]["periodo"],
    "avaliacoes_realizadas": len([a for a in realizadas if a["n"] > 0]),
}
with open(os.path.join(BASE, "atualizacao.json"), "w", encoding="utf-8") as fh:
    json.dump(carimbo, fh, ensure_ascii=False, indent=1)
print(f"gerado index.html e Painel_Qualificacao_2026.html ({os.path.getsize(os.path.join(BASE, 'index.html')) // 1024} KB)")
print(f"carimbo: montado em {carimbo['montado_em']}, planilha de {carimbo['planilha_versao']}, {carimbo['unidades']} maternidades, linha de base e {carimbo['avaliacoes_realizadas']} avaliações realizadas")
