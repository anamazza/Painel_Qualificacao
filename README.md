# Painel de Qualificação · Maternidades Estratégicas

Painel da classificação trimestral das práticas de atenção obstétrica, atenção neonatal e gestão nas maternidades
apoiadas pelo projeto Qualificação do Modelo de Gestão em Maternidades Estratégicas (IFF/Fiocruz). Mesma identidade
visual dos painéis de Nascimentos, Internação, Mortalidade e Habilitações.

**Publicação:** https://anamazza.github.io/Painel_Qualificacao/ (página sem indexação por buscadores; o endereço é
compartilhado só com quem vai avaliar) · **Arquivo final:** `index.html` (idêntico a `Painel_Qualificacao_2026.html`), HTML único e autocontido: abre com dois
cliques, sem internet e sem servidor.

## O que o painel contém

- **Recorte geral** (barra fixa no topo): avaliação, região e estado. Vale para todas as seções.
- **Mapa das maternidades**: estados coloridos pelo percentual dos itens classificados no nível escolhido e um
  ponto por maternidade. Tocar em um estado ou em uma região filtra o painel inteiro; tocar no ponto abre o perfil
  da unidade. A posição dos pontos é aproximada (latitude e longitude do CNES convertidas para a malha).
- **Visão geral**: distribuição dos níveis em cada avaliação, indicadores-chave da avaliação escolhida com a variação
  desde a primeira, e distribuição por eixo e dimensão.
- **Indicadores**: os 40 indicadores, com as maternidades em cada nível; ao tocar em um indicador, a lista das
  maternidades por nível.
- **Regiões e estados**: tabela Brasil, regiões e estados (ou os oito grupos de estados da planilha), para todos os
  indicadores, um eixo, uma dimensão ou um indicador; download em CSV.
- **Maternidades**: quadro maternidade × indicador, com cor e sigla do nível; busca, ordenação e download em CSV.
- **Mudanças de nível**: comparação item a item entre duas avaliações (avanços, recuos, de qual nível para qual
  nível, por indicador e por maternidade).
- **Preenchimento**: percentual de itens classificados por grupo de estados da planilha e por dimensão.
- **Perfil da unidade**: página própria de cada maternidade, com os 40 indicadores nas cinco avaliações, resumo por
  dimensão, PDF pela impressão e CSV. O endereço `index.html#<CNES>` abre o perfil direto.
- **Notas metodológicas**: fonte, regras de leitura e cobertura.

## Fontes

| O quê | De onde vem |
|---|---|
| Classificação por maternidade, indicador e avaliação | planilha de acompanhamento fornecida pela coordenação (pasta `fonte/`, fora do repositório) |
| Eixos, dimensões, nomes dos indicadores, níveis e cores, período das avaliações, níveis de análise | documento "LISTA DE INDICADORES" da coordenação, transcrito em `indicadores.csv` e em `build_dados.py` |
| CNES, nome, município e região de cada maternidade | `servicos_cnes.csv`: nome do serviço na planilha associado ao CNES usado nos demais painéis |

O painel não usa dados do DATASUS.

## Regras de leitura (decisões da coordenação em 11/11/2026)

1. Só as abas regionais da planilha são lidas, maternidade a maternidade. As abas "Brasil" e "Por Região" e as linhas
   de total, percentual e média não são usadas: o painel refaz todas as contagens.
2. "SI" e célula em branco têm o mesmo significado: sem informação.
3. Marcação com erro de digitação que contenha um único "1" (por exemplo "~1") é lida como "1" e fica registrada em
   `relatorio_leitura.md` e nas notas do painel.
4. Percentuais são calculados sobre os itens classificados. "Não se Aplica" conta como classificado.
5. Avanço e recuo seguem a ordem Não Iniciado, Intermediário, Avançado, Qualificado; mudanças de ou para
   "Não se Aplica" são contadas à parte.

## Como atualizar quando chegar uma nova planilha

1. Salvar a nova planilha `.xlsx` na pasta `fonte/` (a mais recente é usada).
2. Rodar `py montar_painel.py --ler`. O comando relê a planilha, grava `dados_qualificacao.js` e
   `relatorio_leitura.md` e remonta `index.html`.
3. Conferir o `relatorio_leitura.md`: itens por avaliação, o que ficou sem informação, marcações corrigidas e
   diferenças em relação às linhas "Total" da própria planilha.
4. Publicar: `git add -A`, `git commit`, `git push`.

O `build_dados.py` interrompe a leitura, com mensagem, se a planilha mudar de estrutura: aba regional ausente,
cabeçalho de níveis fora do lugar, número de indicadores diferente de 40, texto de indicador alterado ou serviço
sem correspondência em `servicos_cnes.csv`. Um serviço novo precisa de uma linha nova em `servicos_cnes.csv`.

## Estrutura

- `painel_base.html` — estrutura e estilos (fonte editável)
- `painel_app.js` — lógica do painel (fonte editável)
- `build_dados.py` — leitura da planilha; gera `dados_qualificacao.js` e `relatorio_leitura.md`
- `montar_painel.py` — monta `index.html`, `Painel_Qualificacao_2026.html`, `dados.json` e `atualizacao.json`
- `indicadores.csv` — os 40 indicadores (ordem e nomes do documento, texto e posição na planilha)
- `servicos_cnes.csv` — os 50 serviços da planilha e o CNES de cada um
- `geo_uf.json` — malha dos estados usada no mapa (a mesma dos demais painéis; embutida pelo `build_dados.py`)
- `logos_institucionais.png` — imagem embutida na montagem
- `fonte/` — planilha e documento originais (não vão para o repositório; ver `.gitignore`)

## Situação em 11/11/2026

- Planilha lida: versão de 10/11/2026. 50 maternidades em 27 UFs, 40 indicadores, 4 de 5 avaliações realizadas.
- Na 4ª avaliação, 1.162 de 2.000 itens estão classificados. As três abas do Nordeste (19 maternidades) têm 9 dos
  40 indicadores preenchidos; nas demais, 8 indicadores estão sem classificação em todas as maternidades.
- A coordenação informou que os dados restantes serão enviados; o painel será refeito com a nova planilha.
- A associação de cada serviço ao CNES foi feita pelo nome e aguarda confirmação da equipe responsável pela planilha.
