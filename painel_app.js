/* ============================================================
   Painel de Qualificação · Maternidades Estratégicas — app
   Dados: const DADOS (dados_qualificacao.js, gerado por build_dados.py a partir da planilha de acompanhamento):
     DADOS.maternidades[] = {cnes, nome, nomePlanilha, uf, regiao, municipio, aba, grupo, lat, lon, c[40][5]}
       c[indicador][avaliação] = índice do nível (0 a 4, ordem de DADOS.niveis) ou null (sem informação)
     DADOS.niveis[] = {id, rot, cod, cor}; DADOS.avaliacoes[] = {n, rot, periodo, meses, realizada}
     DADOS.eixos[], DADOS.dimensoes[] = {id, eixo, rot}; DADOS.indicadores[] = {id, eixo, dim, rot, texto, nPlanilha}
     DADOS.grupos[] = {aba, rot, regiao} (abas regionais da planilha); DADOS.correcoes[], DADOS.anomalias[]
   Seções: visão geral, indicadores, regiões e estados, maternidades (quadro), mudanças de nível, preenchimento,
   notas e perfil da unidade (página sobreposta). Mesma família visual dos painéis de Nascimentos, Internação,
   Mortalidade e Habilitações.
   ============================================================ */
"use strict";

const MAT = DADOS.maternidades, NIV = DADOS.niveis, AVS = DADOS.avaliacoes, IND = DADOS.indicadores;
const DIM = DADOS.dimensoes, EIX = DADOS.eixos, GRP = DADOS.grupos;
const TODOS = IND.map((_, i) => i);
const REALIZADAS = AVS.map((a, i) => a.realizada ? i : -1).filter(i => i >= 0);
const PRIM = REALIZADAS.length ? REALIZADAS[0] : 0;
const ULT = REALIZADAS.length ? REALIZADAS[REALIZADAS.length - 1] : 0;
const REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];
const UF_NOME = {AC:"Acre",AL:"Alagoas",AM:"Amazonas",AP:"Amapá",BA:"Bahia",CE:"Ceará",DF:"Distrito Federal",
ES:"Espírito Santo",GO:"Goiás",MA:"Maranhão",MG:"Minas Gerais",MS:"Mato Grosso do Sul",MT:"Mato Grosso",
PA:"Pará",PB:"Paraíba",PE:"Pernambuco",PI:"Piauí",PR:"Paraná",RJ:"Rio de Janeiro",RN:"Rio Grande do Norte",
RO:"Rondônia",RR:"Roraima",RS:"Rio Grande do Sul",SC:"Santa Catarina",SE:"Sergipe",SP:"São Paulo",TO:"Tocantins"};
const EIXO_ROT = Object.fromEntries(EIX.map(e => [e.id, e.rot]));
const DIM_POR = Object.fromEntries(DIM.map(d => [d.id, d]));
const INDS_DIM = Object.fromEntries(DIM.map(d => [d.id, TODOS.filter(i => IND[i].dim === d.id)]));
const INDS_EIXO = Object.fromEntries(EIX.map(e => [e.id, TODOS.filter(i => IND[i].eixo === e.id)]));
const MAT_POR = Object.fromEntries(MAT.map(m => [m.cnes, m]));
const HAB_URL = "https://anamazza.github.io/Indicadores_Brasil/habilitacoes/";

/* estado: recorte geral (vale para todas as seções) e escolhas de cada seção */
const S = {av: ULT, regiao: "", uf: ""};
const E = {ind: null, escopo: "todos", modo: "regioes", ordem: "uf", busca: "", de: PRIM, para: ULT, nivelMapa: "ep", pontos: true, escopoRes: "todos", eixoMat: ""};

/* ---------------- utilidades ---------------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmtInt = v => v == null ? "—" : Math.round(v).toLocaleString("pt-BR");
const fmt1 = v => v.toLocaleString("pt-BR", {minimumFractionDigits: 1, maximumFractionDigits: 1});
const pct = (q, base) => base ? fmt1(q / base * 100) + "%" : "—";
const dataBR = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || "—"); };
const plural = (n, s, p) => `${fmtInt(n)} ${n === 1 ? s : p}`;
const normTxt = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const tip = html => ` data-tip="${esc(html)}"`;
const rotAv = i => `${AVS[i].rot} (${AVS[i].periodo})`;
const rotRecorte = () => S.uf ? UF_NOME[S.uf] : (S.regiao ? `Região ${S.regiao}` : "Brasil");
const recorte = () => MAT.filter(m => (!S.regiao || m.regiao === S.regiao) && (!S.uf || m.uf === S.uf));
const porUFNome = (a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome, "pt-BR");
const nivelRot = v => v == null ? "Sem informação" : NIV[v].rot;
MAT.forEach(m => { m._busca = normTxt(`${m.nome} ${m.nomePlanilha} ${m.municipio} ${m.uf} ${UF_NOME[m.uf]} ${m.cnes}`); });
NIV.forEach((n, k) => document.documentElement.style.setProperty("--n" + k, n.cor));

const csvCampo = v => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function baixarCSV(nome, linhas){
  const txt = "﻿" + linhas.map(l => l.map(csvCampo).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], {type: "text/csv;charset=utf-8"}));
  a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const cabecalhoCSV = txt => [`Painel de Qualificação · dados de ${dataBR(DADOS.fonte.modificadoEm)} · ${txt}`];
function segmento(id, aoMudar){
  const el = $(id);
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if(!b || b.disabled) return;
    el.querySelectorAll("button").forEach(x => x.classList.toggle("ativo", x === b));
    aoMudar(b.dataset);
  });
}

/* contagem dos níveis em um conjunto de maternidades e de indicadores, em uma avaliação */
function dist(mats, inds, a){
  const n = [0, 0, 0, 0, 0]; let si = 0;
  for(const m of mats) for(const i of inds){ const v = m.c[i][a]; if(v == null) si++; else n[v]++; }
  const cls = n[0] + n[1] + n[2] + n[3] + n[4];
  return {n, si, cls, total: cls + si};
}
/* barra empilhada. modo "pct": só os classificados, rótulo em %; modo "n": inclui sem informação, rótulo = contagem */
function pilha(d, modo){
  const comSI = modo === "n";
  const base = comSI ? d.total : d.cls;
  if(!d.cls && !comSI) return `<span class="pilha vazia"${tip(`Sem informação nos ${fmtInt(d.total)} itens`)}>sem informação</span>`;
  if(!base) return `<span class="pilha vazia">—</span>`;
  /* toda faixa leva o seu rótulo: a largura mínima de cada uma é a do próprio rótulo, e as demais cedem espaço */
  const faixa = (cls, q, rot, dica) => `<i class="${cls}" style="flex:${q} 1 0; min-width:calc(${rot.length}ch + .5rem)"${dica}>${esc(rot)}</i>`;
  let h = "";
  NIV.forEach((nv, k) => {
    const q = d.n[k]; if(!q) return;
    h += faixa("n" + k, q, rotFaixa(q, d.cls, modo), tip(`<b>${esc(nv.rot)}</b>: ${fmtInt(q)} · ${pct(q, d.cls)} dos classificados`));
  });
  if(comSI && d.si) h += faixa("nsi", d.si, fmtInt(d.si), tip(`<b>Sem informação</b>: ${fmtInt(d.si)} de ${fmtInt(d.total)}`));
  return `<span class="pilha">${h}</span>`;
}
/* rótulo de uma faixa: contagem (modo "n") ou percentual dos classificados (modo "pct"; abaixo de 0,5% aparece "<1%") */
function rotFaixa(q, cls, modo){
  if(modo === "n") return fmtInt(q);
  const p = Math.round(q / cls * 100);
  return p < 1 ? "<1%" : p + "%";
}
/* Em processo de qualificação (definição da coordenação, 11/11/2026): Intermediário + Avançado + Qualificado sobre o
   total dos quatro níveis de progresso (Não Iniciado, Intermediário, Avançado e Qualificado). Resume a parcela em que
   alguma ação já foi feita. "Não se Aplica" e os itens sem informação não entram na conta. */
const EP_ROT = "Em processo de qualificação", EP_COR = "#4A9BD1";
function emProc(d){ const num = d.n[2] + d.n[3] + d.n[4], den = d.n[1] + num; return {num, den, pct: den ? num / den * 100 : null}; }
const epTxt = d => { const e = emProc(d); return e.pct == null ? "—" : fmt1(e.pct) + "%"; };
const epChip = d => { const e = emProc(d);
  return `<span class="ep"${tip(`<b>${EP_ROT}</b>: ${fmtInt(e.num)} de ${fmtInt(e.den)}<br>Intermediário + Avançado + Qualificado sobre o total dos quatro níveis`)}>${e.pct == null ? "—" : fmt1(e.pct) + "%"}</span>`; };
const legendaHtml = comSI => NIV.map((n, k) => `<span><i class="q n${k}"></i>${esc(n.rot)}</span>`).join("") + (comSI ? `<span><i class="q nsi"></i>Sem informação</span>` : "") +
  `<span><span class="ep ep-leg">%</span>${EP_ROT}: Intermediário + Avançado + Qualificado sobre o total</span>`;

/* uma linha de gráfico: rótulo, barra empilhada, percentual em processo de qualificação e nota à direita */
const linBarra = (cls, rot, sub, dd, modo, nota) => `<div class="lin ${cls}"><span class="rot">${esc(rot)}${sub ? `<small>${esc(sub)}</small>` : ""}</span>${pilha(dd, modo)}${epChip(dd)}<span class="n">${nota}</span></div>`;
const cabEixo = (e, extra, png) => `<div class="eixo-cab"><h3>${esc(extra || e.rot)}</h3><span class="chip">${plural(INDS_EIXO[e.id].length, "indicador", "indicadores")}</span><button class="chip chip-botao png" data-png="${png}" title="Baixar este gráfico em PNG">⬇ PNG</button></div>`;

/* ---------------- dica flutuante ---------------- */
const tipEl = $("tip");
function tipCelula(td){
  const m = MAT_POR[td.parentNode.dataset.cnes], i = +td.dataset.i; if(!m) return "";
  return `<b>${esc(m.nome)}</b> (${m.uf})<br>${IND[i].id}. ${esc(IND[i].rot)}<br><b>${esc(nivelRot(m.c[i][S.av]))}</b> · ${esc(rotAv(S.av))}`;
}
document.addEventListener("mousemove", e => {
  const el = e.target.closest ? e.target.closest("[data-tip],td.c[data-i]") : null;
  if(!el){ tipEl.hidden = true; tipEl._de = null; return; }
  if(tipEl._de !== el){ const html = el.dataset.tip || tipCelula(el); if(!html){ tipEl.hidden = true; return; } tipEl.innerHTML = html; tipEl._de = el; }
  tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect(); let x = e.clientX + 14, y = e.clientY + 16;
  if(x + r.width > innerWidth - 8) x = e.clientX - r.width - 12;
  if(y + r.height > innerHeight - 8) y = e.clientY - r.height - 12;
  tipEl.style.left = Math.max(6, x) + "px"; tipEl.style.top = Math.max(6, y) + "px";
});
document.addEventListener("scroll", () => { tipEl.hidden = true; tipEl._de = null; }, true);

/* ---------------- cabeçalho, destaques e notas ---------------- */
function montarCabecalho(){
  const versao = dataBR(DADOS.fonte.modificadoEm);
  $("heroFonte").textContent = `versão prévia · dados de ${versao}`;
  $("rodapeFonte").textContent = `versão prévia · acompanhamento trimestral da coordenação, dados de ${versao}`;
  $("heroNiveis").innerHTML = NIV.map((n, k) => `<span><i class="q n${k}"></i>${esc(n.rot)}</span>`).join("") + `<span><i class="q nsi"></i>Sem informação</span>`;
  const ufs = new Set(MAT.map(m => m.uf));
  const d = dist(MAT, TODOS, ULT);
  $("statMat").textContent = fmtInt(MAT.length);
  $("statMatSub").textContent = `em ${ufs.size} unidades da federação`;
  $("statInd").textContent = fmtInt(IND.length);
  $("statIndSub").textContent = `${DIM.length} dimensões em ${EIX.length} eixos`;
  $("statAv").textContent = `${REALIZADAS.length} de ${AVS.length}`;
  $("statAvSub").textContent = `última: ${AVS[ULT].periodo}`;
  $("statCls").textContent = fmtInt(d.cls);
  $("statClsSub").textContent = `de ${fmtInt(d.total)} na ${AVS[ULT].rot}`;
  $("statEP").textContent = epTxt(d);
  $("statEPSub").textContent = `dos itens avaliados na ${AVS[ULT].rot}`;
  $("statQual").textContent = pct(d.n[4], d.cls);
  $("statQualSub").textContent = `dos classificados na ${AVS[ULT].rot}`;
  $("btnNotas").addEventListener("click", () => $("secNotas").scrollIntoView({behavior: "smooth"}));

  /* notas */
  $("notaFonte").innerHTML = `
    <p><b>Acompanhamento trimestral.</b> Os dados vêm do acompanhamento das práticas de atenção e gestão das maternidades, realizado pela coordenação do projeto. A cada avaliação trimestral, cada maternidade recebe um nível de classificação em cada indicador. Esta versão reúne os registros recebidos até ${versao}.</p>
    <p><b>Indicadores e níveis.</b> Os eixos, as dimensões, os indicadores, os níveis de classificação e as suas cores, o período de cada avaliação e os níveis de análise (Brasil, regiões, estados e maternidades) foram definidos pela coordenação.</p>
    <p>Este painel não usa dados dos sistemas de informação do Ministério da Saúde. Os critérios de cada nível em cada indicador pertencem ao instrumento de avaliação da coordenação; o painel reproduz a classificação registrada.</p>`;
  $("notaNiveis").innerHTML = `
    <p><b>Níveis de classificação:</b></p>
    <ul>${NIV.map((n, k) => `<li><i class="q n${k}" style="vertical-align:-2px"></i> <b>${esc(n.rot)}</b> (sigla ${esc(n.cod)} no quadro das maternidades)</li>`).join("")}
    <li><i class="q nsi" style="vertical-align:-2px"></i> <b>Sem informação</b>: item ainda sem nível registrado</li></ul>
    <p><b>Avaliações:</b></p>
    <ul>${AVS.map(a => `<li><b>${esc(a.rot)}</b>: ${esc(a.periodo)} (${esc(a.meses)})${a.realizada ? "" : " · a realizar"}</li>`).join("")}</ul>`;
  $("notaRegras").innerHTML = `<ul>
    <li><b>Contagens.</b> Cada item é o nível de um indicador em uma maternidade, em uma avaliação. Todos os totais e percentuais são calculados pelo painel a partir desses itens.</li>
    <li><b>Sem informação.</b> Item ainda sem nível registrado. Aparece em branco e não entra nos percentuais.</li>
    <li><b>Percentuais dos níveis.</b> São calculados sobre os itens classificados. "Não se Aplica" é um nível registrado e conta como item classificado.</li>
    <li><b>Em processo de qualificação.</b> Indicador definido pela coordenação: soma dos itens em Intermediário, Avançado e Qualificado, dividida pelo total de itens nos quatro níveis de progresso (Não Iniciado, Intermediário, Avançado e Qualificado). Resume a parcela em que alguma ação já foi realizada, isto é, que deixou o nível Não Iniciado. Os itens em "Não se Aplica" e os itens sem informação não entram nesse cálculo.</li>
    <li><b>Mudanças de nível.</b> Avanço e recuo seguem a ordem Não Iniciado, Intermediário, Avançado e Qualificado, e só comparam itens classificados nas duas avaliações. Mudanças de ou para "Não se Aplica" são contadas separadamente.</li>
  </ul>`;
  const semNenhuma = TODOS.filter(i => MAT.every(m => m.c[i][ULT] == null)).map(i => IND[i]);
  const porGrupo = GRP.map(g => { const ms = MAT.filter(m => m.aba === g.aba); return {g, n: ms.length, com: TODOS.filter(i => ms.some(m => m.c[i][ULT] != null)).length}; });
  $("notaCobertura").innerHTML = `
    <p><b>Versão prévia.</b> O painel mostra apenas o que já foi registrado. O que ainda não foi preenchido aparece em branco, como "sem informação", e o painel é atualizado a cada nova remessa de dados.</p>
    <p><b>Cobertura na ${esc(AVS[ULT].rot)}.</b> ${fmtInt(d.cls)} dos ${fmtInt(d.total)} itens (${fmtInt(MAT.length)} maternidades × ${IND.length} indicadores) estão classificados. Indicadores com pelo menos uma maternidade classificada, por grupo de estados:</p>
    <ul>${porGrupo.map(x => `<li><b>${esc(x.g.rot)}</b> (${plural(x.n, "maternidade", "maternidades")}): ${x.com} de ${IND.length} indicadores</li>`).join("")}</ul>
    ${semNenhuma.length ? `<p><b>Indicadores sem classificação em nenhuma maternidade:</b> ${semNenhuma.map(i => `${esc(i.rot)} (${esc(DIM_POR[i.dim].rot)})`).join("; ")}.</p>` : ""}
    <p><b>Avaliações a realizar:</b> ${AVS.filter(a => !a.realizada).map(a => `${esc(a.rot)} (${esc(a.periodo)})`).join("; ") || "nenhuma"}.</p>
    <p><b>Identificação das maternidades.</b> Cada maternidade está identificada pelo código do Cadastro Nacional de Estabelecimentos de Saúde (CNES) e pelo nome usados nos painéis de Nascimentos, Internação, Mortalidade e Habilitações. As ${fmtInt(MAT.length)} maternidades pertencem ao grupo de maternidades apoiadas (estratégicas) desses painéis.</p>`;
}

/* ---------------- recorte geral ---------------- */
function montarRecorte(){
  $("segAv").innerHTML = AVS.map((a, i) => `<button data-av="${i}" class="${i === S.av ? "ativo" : ""}"${a.realizada ? "" : " disabled title=\"Avaliação a realizar\""}>${a.n}ª <small>${esc(a.periodo)}</small></button>`).join("");
  segmento("segAv", d => { S.av = +d.av; renderTudo(); });
  const selR = $("selRegiao"), selU = $("selUF");
  REGIOES.filter(r => MAT.some(m => m.regiao === r)).forEach(r => selR.appendChild(new Option(`${r} (${MAT.filter(m => m.regiao === r).length})`, r)));
  selR.addEventListener("change", () => { S.regiao = selR.value; S.uf = ""; renderTudo(); });
  selU.addEventListener("change", () => { S.uf = selU.value; if(S.uf) S.regiao = MAT.find(m => m.uf === S.uf).regiao; renderTudo(); });
  $("btnLimpar").addEventListener("click", () => { S.regiao = ""; S.uf = ""; renderTudo(); });
}
function sincronizaRecorte(){
  $("segAv").querySelectorAll("button").forEach(b => b.classList.toggle("ativo", +b.dataset.av === S.av));
  $("selRegiao").value = S.regiao;
  const selU = $("selUF"); selU.length = 1;
  [...new Set(MAT.filter(m => !S.regiao || m.regiao === S.regiao).map(m => m.uf))].sort((a, b) => UF_NOME[a].localeCompare(UF_NOME[b], "pt-BR"))
    .forEach(uf => selU.appendChild(new Option(`${UF_NOME[uf]} (${MAT.filter(m => m.uf === uf).length})`, uf)));
  selU.value = S.uf;
  $("btnLimpar").hidden = !S.regiao && !S.uf;
  const mats = recorte(), d = dist(mats, TODOS, S.av);
  $("recorteResumo").innerHTML = `<b>${esc(rotRecorte())}</b> · ${plural(mats.length, "maternidade", "maternidades")} · ${esc(rotAv(S.av))}<br>${fmtInt(d.cls)} itens classificados de ${fmtInt(d.total)}`;
}

/* ============================================================
   0. MAPA — estados coloridos pelo percentual de um nível; tocar no estado ou na região filtra o painel inteiro.
   Malha: const GEO (geo_uf.json, a mesma dos demais painéis). Os pontos usam a latitude e a longitude do CNES,
   convertidas para a malha pela aproximação do Painel de Habilitações (polinômio de grau 3) e, quando caem fora
   do próprio estado, deslocadas para dentro dele. Por isso a posição é aproximada.
   ============================================================ */
const NS = "http://www.w3.org/2000/svg";
const TEM_GEO = typeof GEO !== "undefined" && GEO && Array.isArray(GEO.uf);
const REGIAO_UFS = {Norte:["AC","AM","AP","PA","RO","RR","TO"],Nordeste:["AL","BA","CE","MA","PB","PE","PI","RN","SE"],
"Centro-Oeste":["DF","GO","MS","MT"],Sudeste:["ES","MG","RJ","SP"],Sul:["PR","RS","SC"]};
const PROJ = {lon0: -54, lat0: -14, deg: 3,
  cx: [389.6693924797041,-25.669375918899323,2.2974764087746746,6.94771717316214,227.5848973996615,10.44407831174322,-15.59958425479866,2.614872436012288,11.203067014348914,-9.255000451100843],
  cy: [384.79217286263037,-206.11315840845927,-1.297115372976244,0.4508034745453812,5.709727699623541,5.132886143071913,2.0589199190583702,3.9090790755116522,2.524876252788176,-5.129157042018251]};
function projeta(lon, lat){
  const u = (lon - PROJ.lon0) / 10, v = (lat - PROJ.lat0) / 10, t = [];
  for(let a = 0; a <= PROJ.deg; a++) for(let b = 0; b <= PROJ.deg - a; b++) t.push(Math.pow(u, a) * Math.pow(v, b));
  return [t.reduce((s, x, k) => s + x * PROJ.cx[k], 0), t.reduce((s, x, k) => s + x * PROJ.cy[k], 0)];
}
function encaixaPontos(){
  if(!TEM_GEO) return;
  const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", `0 0 ${GEO.W} ${GEO.H}`);
  svg.style.cssText = "position:absolute; width:0; height:0; overflow:hidden"; document.body.appendChild(svg);
  const paths = {};
  GEO.uf.forEach(t => { const p = document.createElementNS(NS, "path"); p.setAttribute("d", t.d); svg.appendChild(p); paths[t.id] = p; });
  const dentro = (p, xy) => { const pt = svg.createSVGPoint(); pt.x = xy[0]; pt.y = xy[1]; return p.isPointInFill(pt); };
  const interior = p => {
    const pts = [...p.getAttribute("d").matchAll(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g)].map(m => [+m[1], +m[2]]);
    const c = [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
    if(dentro(p, c)) return c;
    const bb = p.getBBox(), b = [bb.x + bb.width / 2, bb.y + bb.height / 2];
    return dentro(p, b) ? b : pts[0];
  };
  const postos = [];
  MAT.slice().sort(porUFNome).forEach(m => {
    if(m.lat == null || m.lon == null){ m._xy = null; return; }
    let xy = projeta(m.lon, m.lat); const p = paths[m.uf];
    if(p && !dentro(p, xy)) xy = interior(p);
    const vizinhos = postos.filter(q => Math.hypot(q[0] - xy[0], q[1] - xy[1]) < 5).length;   // maternidades do mesmo município
    if(vizinhos){ const ang = vizinhos * 2.1; xy = [xy[0] + 6 * Math.cos(ang), xy[1] + 6 * Math.sin(ang)]; }
    postos.push(xy); m._xy = xy;
  });
  svg.remove();
}
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mistura = (hex, t) => `rgb(${hexRgb(hex).map(v => Math.round(255 + (v - 255) * t)).join(",")})`;   // do branco (0) à cor cheia (1)
const PASSOS_MAPA = [.16, .34, .54, .76, 1];
const CLASSES_MAPA = [{ate: 10, rot: "até 10%"}, {ate: 25, rot: "mais de 10% a 25%"}, {ate: 40, rot: "mais de 25% a 40%"}, {ate: 60, rot: "mais de 40% a 60%"}, {ate: 100, rot: "mais de 60%"}];
const CLASSES_EP = [{ate: 40, rot: "até 40%"}, {ate: 60, rot: "mais de 40% a 60%"}, {ate: 75, rot: "mais de 60% a 75%"}, {ate: 90, rot: "mais de 75% a 90%"}, {ate: 100, rot: "mais de 90%"}];
let svgMapa = null, animMapa = null, vbMapa = null;
function ajustaEscalaMapa(){
  if(!svgMapa) return;
  const k = Number(svgMapa.getAttribute("viewBox").split(" ")[2]) / GEO.W;
  svgMapa.querySelectorAll("circle.ponto").forEach(c => c.setAttribute("r", (5.2 * k).toFixed(2)));
  svgMapa.querySelectorAll("text.sigla").forEach(t => {
    t.setAttribute("font-size", (13 * k).toFixed(2)); t.setAttribute("y", (Number(t.dataset.cy) + 4.5 * k).toFixed(1));
    t.style.display = Number(t.dataset.w) >= 22 * k && Number(t.dataset.h) >= 16 * k ? "" : "none";
  });
}
function animaMapa(alvo){
  cancelAnimationFrame(animMapa);
  const de = svgMapa.getAttribute("viewBox").split(" ").map(Number), t0 = performance.now(), dur = 420;
  if(de.every((v, i) => Math.abs(v - alvo[i]) < .5)){ vbMapa = alvo; return; }
  const passo = agora => { const k = Math.min(1, (agora - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    svgMapa.setAttribute("viewBox", de.map((v, i) => v + (alvo[i] - v) * e).map(v => v.toFixed(1)).join(" ")); ajustaEscalaMapa();
    if(k < 1) animMapa = requestAnimationFrame(passo); };
  vbMapa = alvo; animMapa = requestAnimationFrame(passo);
}
function cliqueUF(uf){
  if(S.uf === uf) S.uf = ""; else { S.uf = uf; S.regiao = REGIOES.find(r => REGIAO_UFS[r].includes(uf)) || ""; }
  renderTudo();
}
function renderMapa(){
  const nv = E.nivelMapa, mats = recorte(), dRec = dist(mats, TODOS, S.av);
  const ehEP = nv === "ep", corMapa = ehEP ? EP_COR : NIV[nv].cor, classes = ehEP ? CLASSES_EP : CLASSES_MAPA;
  $("pillsRegiao").querySelectorAll("button").forEach(b => b.classList.toggle("ativo", b.dataset.regiao === S.regiao));
  $("pillsNivel").querySelectorAll("button").forEach(b => b.classList.toggle("ativo", b.dataset.nivel === String(nv)));
  /* resumo do recorte */
  $("mapaResumo").innerHTML = `
    <p class="eyebrow">Recorte em uso no painel</p>
    <h3 style="margin-top:.35rem">${esc(rotRecorte())}</h3>
    <p class="sub">${esc(rotAv(S.av))}</p>
    <div class="kpi-lista">
      <div class="kpi"><span>Maternidades</span><span class="v">${fmtInt(mats.length)}</span></div>
      <div class="kpi"><span>Itens classificados</span><span class="v">${fmtInt(dRec.cls)}<small>de ${fmtInt(dRec.total)}</small></span></div>
      <div class="kpi"><span>${EP_ROT}</span><span class="v">${epTxt(dRec)}</span></div>
    </div>
    <div style="margin-top:.8rem">${pilha(dRec, "pct")}</div>
    ${S.uf ? `<ul class="lista-unid" style="margin-top:.8rem">${mats.slice().sort(porUFNome).map(m => `<li><button data-cnes="${m.cnes}">${esc(m.nome)}</button><small>${esc(m.municipio)}</small></li>`).join("")}</ul>` : ""}
    ${S.regiao || S.uf ? `<p style="margin-top:.8rem"><button class="chip chip-botao" data-limpar="1">✕ voltar ao Brasil</button></p>` : ""}`;
  const box = $("mapaSvg");
  if(!TEM_GEO){ box.innerHTML = `<p class="suave" style="padding:1rem">Malha dos estados não disponível nesta montagem.</p>`; return; }
  const porUF = {}; MAT.forEach(m => { (porUF[m.uf] = porUF[m.uf] || []).push(m); });
  const noRecorte = uf => S.uf ? uf === S.uf : S.regiao ? REGIAO_UFS[S.regiao].includes(uf) : true;
  cancelAnimationFrame(animMapa); box.innerHTML = "";
  svgMapa = document.createElementNS(NS, "svg"); svgMapa.setAttribute("viewBox", (vbMapa || [0, 0, GEO.W, GEO.H]).join(" "));
  svgMapa.setAttribute("role", "img"); svgMapa.setAttribute("aria-label", "Mapa do Brasil com os estados e as maternidades");
  const g = document.createElementNS(NS, "g"), presentes = new Set(), classeUF = {};
  GEO.uf.forEach(t => {
    const ms = porUF[t.id] || [], d = dist(ms, TODOS, S.av), p = ehEP ? emProc(d).pct : (d.cls ? d.n[nv] / d.cls * 100 : null), cls = p == null ? -1 : classes.findIndex(c => p <= c.ate);
    presentes.add(cls); classeUF[t.id] = cls;
    const el = document.createElementNS(NS, "path"); el.setAttribute("d", t.d); el.dataset.uf = t.id;
    el.setAttribute("class", "t" + (S.uf === t.id ? " sel" : "") + (noRecorte(t.id) ? "" : " fora"));
    el.setAttribute("fill", cls < 0 ? "#E4EBE5" : mistura(corMapa, PASSOS_MAPA[cls]));
    el.dataset.tip = `<b>${esc(UF_NOME[t.id])}</b><br>${ms.length ? plural(ms.length, "maternidade", "maternidades") + ` · ${fmtInt(d.cls)} de ${fmtInt(d.total)} itens classificados` : "sem maternidade no painel"}` +
      (d.cls ? `<br><b>${EP_ROT}</b>: ${epTxt(d)}` + (ehEP ? "" : `<br><b>${esc(NIV[nv].rot)}</b>: ${fmtInt(d.n[nv])} · ${pct(d.n[nv], d.cls)} dos classificados`) : "") +
      (ms.length ? "<br>" + ms.slice().sort(porUFNome).slice(0, 6).map(m => "· " + esc(m.nome)).join("<br>") + (ms.length > 6 ? `<br>· mais ${ms.length - 6}` : "") : "");
    el.addEventListener("click", () => cliqueUF(t.id));
    g.appendChild(el);
  });
  svgMapa.appendChild(g); box.appendChild(svgMapa);
  const escuro = cls => cls >= 3 && !ehEP && nv !== 0 && nv !== 2;             // sigla branca só sobre cor escura
  svgMapa.querySelectorAll("path.t").forEach(el => {
    const bb = el.getBBox(), tx = document.createElementNS(NS, "text");
    tx.setAttribute("x", (bb.x + bb.width / 2).toFixed(1)); tx.dataset.cy = (bb.y + bb.height / 2).toFixed(1);
    tx.dataset.w = bb.width.toFixed(1); tx.dataset.h = bb.height.toFixed(1);
    tx.setAttribute("text-anchor", "middle"); tx.setAttribute("class", "sigla");
    tx.setAttribute("fill", escuro(classeUF[el.dataset.uf]) ? "#FFFFFF" : "#0A213D"); tx.setAttribute("opacity", noRecorte(el.dataset.uf) ? ".85" : ".55");
    tx.textContent = el.dataset.uf; g.appendChild(tx);
  });
  if(E.pontos){
    const gp = document.createElementNS(NS, "g");
    MAT.filter(m => m._xy).sort((a, b) => a._xy[1] - b._xy[1]).forEach(m => {
      const c = document.createElementNS(NS, "circle"), d = dist([m], TODOS, S.av);
      c.setAttribute("cx", m._xy[0].toFixed(1)); c.setAttribute("cy", m._xy[1].toFixed(1)); c.setAttribute("class", "ponto" + (noRecorte(m.uf) ? "" : " fora"));
      c.dataset.tip = `<b>${esc(m.nome)}</b><br>${esc(m.municipio)} · ${m.uf} · CNES ${m.cnes}<br>${d.cls} de ${d.total} indicadores classificados` +
        (d.cls ? "<br>" + NIV.map((n, k) => d.n[k] ? `${esc(n.rot)}: ${d.n[k]}` : "").filter(Boolean).join(" · ") : "") + (emProc(d).den ? `<br><b>${EP_ROT}</b>: ${epTxt(d)}` : "") + `<br><i>toque para abrir o perfil da unidade</i>`;
      c.addEventListener("click", () => abrirPerfil(m.cnes));
      gp.appendChild(c);
    });
    svgMapa.appendChild(gp);
  }
  /* enquadramento: Brasil ou a região escolhida */
  let alvo = [0, 0, GEO.W, GEO.H];
  if(S.regiao){
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    svgMapa.querySelectorAll("path.t").forEach(el => { if(!REGIAO_UFS[S.regiao].includes(el.dataset.uf)) return; const bb = el.getBBox();
      x0 = Math.min(x0, bb.x); y0 = Math.min(y0, bb.y); x1 = Math.max(x1, bb.x + bb.width); y1 = Math.max(y1, bb.y + bb.height); });
    const pad = Math.max(x1 - x0, y1 - y0) * .1; alvo = [x0 - pad, y0 - pad, (x1 - x0) + 2 * pad, (y1 - y0) + 2 * pad];
  }
  ajustaEscalaMapa(); animaMapa(alvo);
  $("tituloLegenda").innerHTML = (ehEP ? `Percentual dos itens de cada estado <b>em processo de qualificação</b>` : `Percentual dos itens classificados de cada estado no nível <b>${esc(NIV[nv].rot)}</b>`) + ` · ${esc(rotAv(S.av))}`;
  $("legendaMapa").innerHTML = classes.map((c, i) => presentes.has(i) ? `<span><i class="q" style="background:${mistura(corMapa, PASSOS_MAPA[i])}; box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></i>${c.rot}</span>` : "").join("") +
    (presentes.has(-1) ? `<span><i class="q" style="background:#E4EBE5"></i>sem item classificado</span>` : "") + `<span><i class="ponto-leg"></i>maternidade</span>`;
}
function montarMapa(){
  encaixaPontos();
  $("pillsRegiao").innerHTML = `<button data-regiao="">Brasil <small>${MAT.length}</small></button>` +
    REGIOES.filter(r => MAT.some(m => m.regiao === r)).map(r => `<button data-regiao="${r}">${r} <small>${MAT.filter(m => m.regiao === r).length}</small></button>`).join("");
  $("pillsRegiao").addEventListener("click", e => { const b = e.target.closest("button"); if(!b) return; S.regiao = b.dataset.regiao; S.uf = ""; renderTudo(); });
  $("pillsNivel").innerHTML = `<button data-nivel="ep"><i class="q" style="background:${EP_COR}"></i>${EP_ROT}</button>` + NIV.map((n, k) => `<button data-nivel="${k}"><i class="q n${k}"></i>${esc(n.rot)}</button>`).join("");
  $("pillsNivel").addEventListener("click", e => { const b = e.target.closest("button"); if(!b) return; E.nivelMapa = b.dataset.nivel === "ep" ? "ep" : +b.dataset.nivel; renderMapa(); });
  $("chkPontos").addEventListener("change", e => { E.pontos = e.target.checked; renderMapa(); });
  $("mapaResumo").addEventListener("click", e => { if(e.target.closest("[data-limpar]")){ S.regiao = ""; S.uf = ""; renderTudo(); } });
}

/* ============================================================
   1. VISÃO GERAL
   ============================================================ */
function renderGeral(){
  const mats = recorte();
  $("geralTitulo").textContent = `Distribuição dos níveis de classificação · ${rotRecorte()}`;
  const ds = AVS.map((_, i) => dist(mats, TODOS, i));
  $("evolucao").innerHTML = AVS.map((av, i) => av.realizada
    ? `<button class="lin${i === S.av ? " ativa" : ""}" data-av="${i}"><span class="rot">${esc(av.rot)}<small>${esc(av.periodo)}</small></span>${pilha(ds[i], "pct")}${epChip(ds[i])}<span class="n"><b>${fmtInt(ds[i].cls)}</b> classificados<br>${fmtInt(ds[i].si)} sem informação</span></button>`
    : `<div class="lin"><span class="rot">${esc(av.rot)}<small>${esc(av.periodo)}</small></span><span class="pilha vazia">a realizar</span><span></span><span class="n"></span></div>`).join("");
  $("legendaGeral").innerHTML = legendaHtml(false);
  $("tabEvolucao").innerHTML = `<thead><tr><th>Avaliação</th><th>Período</th><th class="r">Classificados</th>${NIV.map(n => `<th class="r">${esc(n.rot)}</th>`).join("")}<th class="r">${EP_ROT}</th><th class="r">Sem informação</th></tr></thead><tbody>` +
    AVS.map((av, i) => `<tr><td>${esc(av.rot)}</td><td>${esc(av.periodo)}</td>` + (av.realizada
      ? `<td class="r">${fmtInt(ds[i].cls)}</td>${ds[i].n.map(q => `<td class="r">${fmtInt(q)} <small>(${pct(q, ds[i].cls)})</small></td>`).join("")}<td class="r"><b>${epTxt(ds[i])}</b></td><td class="r">${fmtInt(ds[i].si)}</td>`
      : `<td class="r" colspan="${NIV.length + 3}"><small>a realizar</small></td>`) + `</tr>`).join("") + `</tbody>`;

  /* indicadores-chave da avaliação escolhida, com a variação desde a primeira */
  const d = ds[S.av], d0 = ds[PRIM];
  const varia = k => {
    if(S.av === PRIM || !d.cls || !d0.cls) return "";
    const pp = Math.round((d.n[k] / d.cls * 100 - d0.n[k] / d0.cls * 100) * 10) / 10;
    return `<small>${pp > 0 ? "+" : pp < 0 ? "−" : ""}${fmt1(Math.abs(pp))} p.p. desde a ${AVS[PRIM].n}ª avaliação</small>`;
  };
  const ppEP = (S.av === PRIM || emProc(d).pct == null || emProc(d0).pct == null) ? null : Math.round((emProc(d).pct - emProc(d0).pct) * 10) / 10;
  const variaEP = ppEP == null ? "" : `. Variação desde a ${AVS[PRIM].n}ª avaliação: ${ppEP > 0 ? "+" : ppEP < 0 ? "−" : ""}${fmt1(Math.abs(ppEP))} p.p.`;
  $("kpisGeral").innerHTML = `
    <p class="eyebrow">${esc(rotRecorte())} · ${esc(rotAv(S.av))}</p>
    <div class="num-grande" style="margin-top:.5rem">${epTxt(d)}</div>
    <p class="suave" style="font-size:.86rem">dos itens avaliados estão em processo de qualificação: Intermediário, Avançado ou Qualificado${variaEP}</p>
    <div class="kpi-lista">
      <div class="kpi"><span>Maternidades</span><span class="v">${fmtInt(mats.length)}</span></div>
      <div class="kpi"><span>Itens classificados</span><span class="v">${fmtInt(d.cls)}<small>de ${fmtInt(d.total)} (${pct(d.cls, d.total)})</small></span></div>
      <div class="kpi"><span>Sem informação</span><span class="v">${fmtInt(d.si)}</span></div>
      ${NIV.map((n, k) => `<div class="kpi"><span><i class="q n${k}" style="vertical-align:-2px"></i> ${esc(n.rot)}</span><span class="v">${fmtInt(d.n[k])} · ${pct(d.n[k], d.cls)}${varia(k)}</span></div>`).join("")}
    </div>
    <p class="fonte">Percentuais dos níveis sobre os itens classificados. Em processo de qualificação: sobre o total dos quatro níveis de progresso, sem "Não se Aplica". p.p. = pontos percentuais.</p>`;

  $("dimTitulo").textContent = `Por eixo e dimensão · ${rotAv(S.av)}`;
  const nItens = dd => `<b>${fmtInt(dd.cls)}</b> classificados<br>${fmtInt(dd.si)} sem informação`;
  $("porEixo").innerHTML = EIX.map(e => { const de = dist(mats, INDS_EIXO[e.id], S.av);
    return `<div class="card bloco-eixo eixo-${e.id}">${cabEixo(e, "", "eixo:" + e.id)}
      <div class="linhas">${linBarra("eixo", "Todas as dimensões do eixo", "", de, "pct", nItens(de))}${DIM.filter(dm => dm.eixo === e.id).map(dm => { const dd = dist(mats, INDS_DIM[dm.id], S.av);
        return linBarra("dim", dm.rot, plural(INDS_DIM[dm.id].length, "indicador", "indicadores"), dd, "pct", nItens(dd)); }).join("")}</div>
    </div>`; }).join("");
}

/* ============================================================
   2. INDICADORES
   ============================================================ */
function renderInd(){
  const mats = recorte();
  $("listaInd").innerHTML = EIX.map(e => `<div class="card bloco-eixo eixo-${e.id}">${cabEixo(e, "", "ind:" + e.id)}` +
    DIM.filter(dm => dm.eixo === e.id).map(dm => `<p class="grupo-tit">${esc(dm.rot)}</p><div class="linhas" style="margin-top:.3rem">` +
      INDS_DIM[dm.id].map(i => { const d = dist(mats, [i], S.av), aberto = i === E.ind;
        return `<button class="lin${aberto ? " ativa" : ""}" data-i="${i}" aria-expanded="${aberto}"${!aberto && IND[i].texto !== IND[i].rot ? tip(esc(IND[i].texto)) : ""}><span class="rot"><span class="seta">▸</span><b class="num">${IND[i].id}</b>${esc(IND[i].rot)}</span>${pilha(d, "n")}${epChip(d)}<span class="n"><b>${fmtInt(d.cls)}</b> de ${fmtInt(d.total)}<br>classificadas</span></button>` + (aberto ? detalheInd(mats) : ""); }).join("") + `</div>`).join("") + `</div>`).join("");
  $("legendaInd").innerHTML = legendaHtml(true);
}
/* relação das maternidades por nível, aberta logo abaixo do indicador escolhido */
function detalheInd(mats){
  const ind = IND[E.ind], d = dist(mats, [E.ind], S.av);
  const grupos = [4, 3, 2, 1, 0, null].map(v => ({v, lista: mats.filter(m => m.c[E.ind][S.av] === v).sort(porUFNome)})).filter(g => g.lista.length);
  return `<div class="detalhe-ind">
    <p class="sub"><b>${esc(EIXO_ROT[ind.eixo])}</b> · ${esc(DIM_POR[ind.dim].rot)} · ${esc(rotRecorte())} · ${esc(rotAv(S.av))} · ${fmtInt(d.cls)} de ${plural(d.total, "maternidade classificada", "maternidades classificadas")}</p>
    ${ind.texto !== ind.rot ? `<p class="sub"><b>Descrição completa:</b> ${esc(ind.texto)}</p>` : ""}
    <div class="niveis-grid">${grupos.map(g => `<div><p class="niv-tit"><i class="q ${g.v == null ? "nsi" : "n" + g.v}"></i>${esc(nivelRot(g.v))} <small>${fmtInt(g.lista.length)}</small></p>
      <ul class="lista-unid">${g.lista.map(m => `<li><button data-cnes="${m.cnes}">${esc(m.nome)}</button><small>${esc(m.municipio)}/${m.uf}</small></li>`).join("")}</ul></div>`).join("")}</div>
  </div>`;
}

/* ============================================================
   3. REGIÕES E ESTADOS
   ============================================================ */
function indsEscopo(escopo = E.escopo){
  const [t, v] = escopo.split(":");
  return t === "e" ? INDS_EIXO[v] : t === "d" ? INDS_DIM[v] : t === "i" ? [+v] : TODOS;
}
function rotEscopo(escopo = E.escopo){
  const [t, v] = escopo.split(":");
  return t === "e" ? `Eixo ${EIXO_ROT[v]}` : t === "d" ? `Dimensão ${DIM_POR[v].rot}` : t === "i" ? `Indicador ${IND[+v].id}. ${IND[+v].rot}` : "Todos os indicadores";
}
function linhasLocal(){
  const inds = indsEscopo(), rows = [{tipo: "br", rot: "Brasil", mats: MAT, regiao: "", uf: ""}];
  if(E.modo === "grupos") GRP.forEach(g => rows.push({tipo: "grupo", rot: g.rot, sub: "", mats: MAT.filter(m => m.aba === g.aba)}));
  else REGIOES.forEach(r => {
    const mr = MAT.filter(m => m.regiao === r); if(!mr.length) return;
    rows.push({tipo: "reg", rot: r, mats: mr, regiao: r, uf: ""});
    [...new Set(mr.map(m => m.uf))].sort((a, b) => UF_NOME[a].localeCompare(UF_NOME[b], "pt-BR")).forEach(uf => rows.push({tipo: "uf", rot: UF_NOME[uf], mats: mr.filter(m => m.uf === uf), regiao: r, uf}));
  });
  rows.forEach(r => { r.d = dist(r.mats, inds, S.av); });
  return rows;
}
function renderLocal(){
  const rows = linhasLocal();
  const sel = r => r.tipo !== "grupo" && r.regiao === S.regiao && r.uf === S.uf && (r.tipo === "br" ? !S.regiao && !S.uf : r.tipo === "reg" ? !S.uf : true);
  $("tabLocal").innerHTML = `<thead><tr><th>Local</th><th class="r">Maternidades</th><th class="r">Itens classificados</th><th class="r">Sem informação</th><th>Distribuição dos itens classificados</th><th class="r">${EP_ROT}</th><th class="r">Não Iniciado</th><th class="r">Qualificado</th></tr></thead><tbody>` +
    rows.map((r, k) => `<tr class="${r.tipo === "grupo" ? "reg" : r.tipo}${sel(r) ? " sel" : ""}"><td>${r.tipo === "grupo" ? `${esc(r.rot)} <small>${esc(r.sub)}</small>` : `<button class="lk" data-k="${k}">${esc(r.rot)}</button>`}</td>
      <td class="r">${fmtInt(r.mats.length)}</td><td class="r">${fmtInt(r.d.cls)}</td><td class="r">${fmtInt(r.d.si)}</td><td>${pilha(r.d, "pct")}</td>
      <td class="r ep-col"><b>${epTxt(r.d)}</b></td><td class="r">${pct(r.d.n[1], r.d.cls)}</td><td class="r">${pct(r.d.n[4], r.d.cls)}</td></tr>`).join("") + `</tbody>`;
  $("tabLocal")._rows = rows;
  $("legendaLocal").innerHTML = legendaHtml(false) + `<span>${esc(rotEscopo())} · ${esc(rotAv(S.av))}</span>`;
}
function csvLocal(){
  const rows = linhasLocal();
  baixarCSV(`qualificacao_local_${AVS[S.av].n}a_avaliacao.csv`, [cabecalhoCSV(`${rotEscopo()} · ${rotAv(S.av)}`),
    ["Local", "Tipo", "Maternidades", "Itens classificados", "Sem informação", ...NIV.map(n => n.rot), "Intermediário + Avançado + Qualificado", EP_ROT + " (%)"],
    ...rows.map(r => [r.rot, {br: "país", reg: "região", uf: "estado", grupo: "grupo de estados"}[r.tipo], r.mats.length, r.d.cls, r.d.si, ...r.d.n, emProc(r.d).num, emProc(r.d).pct == null ? "" : fmt1(emProc(r.d).pct)])]);
}
function montarLocal(){
  const sel = $("selEscopo");
  sel.appendChild(new Option(`Todos os ${IND.length} indicadores`, "todos"));
  const gE = document.createElement("optgroup"); gE.label = "Eixos";
  EIX.forEach(e => gE.appendChild(new Option(`${e.rot} (${INDS_EIXO[e.id].length} indicadores)`, "e:" + e.id)));
  const gD = document.createElement("optgroup"); gD.label = "Dimensões";
  DIM.forEach(d => gD.appendChild(new Option(`${EIXO_ROT[d.eixo]} · ${d.rot}`, "d:" + d.id)));
  sel.appendChild(gE); sel.appendChild(gD);
  DIM.forEach(d => { const g = document.createElement("optgroup"); g.label = `Indicadores · ${d.rot}`;
    INDS_DIM[d.id].forEach(i => g.appendChild(new Option(`${IND[i].id}. ${IND[i].rot}`, "i:" + i))); sel.appendChild(g); });
  sel.addEventListener("change", () => { E.escopo = sel.value; renderLocal(); });
  segmento("segModo", d => { E.modo = d.modo; renderLocal(); });
  $("btnCsvLocal").addEventListener("click", csvLocal);
  $("tabLocal").addEventListener("click", e => {
    const b = e.target.closest("button[data-k]"); if(!b) return;
    const r = $("tabLocal")._rows[+b.dataset.k]; S.regiao = r.regiao; S.uf = r.uf; renderTudo();
  });
}

/* ============================================================
   4. MATERNIDADES — quadro maternidade × indicador
   ============================================================ */
function matsQuadro(){
  const q = normTxt(E.busca.trim());
  const lista = recorte().filter(m => !q || m._busca.includes(q));
  const indsQ = E.eixoMat ? INDS_EIXO[E.eixoMat] : TODOS;       /* a ordenação segue o eixo mostrado no quadro */
  const nQ = m => indsQ.reduce((s, i) => s + (m.c[i][S.av] === 4 ? 1 : 0), 0);
  if(E.ordem === "nome") lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  else if(E.ordem === "q") lista.sort((a, b) => nQ(b) - nQ(a) || porUFNome(a, b));
  else lista.sort(porUFNome);
  return lista;
}
function renderMatriz(){
  const lista = matsQuadro();
  const dims = DIM.filter(d => !E.eixoMat || d.eixo === E.eixoMat), inds = dims.flatMap(d => INDS_DIM[d.id]);
  const cab1 = dims.map(d => `<th colspan="${INDS_DIM[d.id].length}"${tip(`<b>${esc(EIXO_ROT[d.eixo])}</b><br>${esc(d.rot)}`)}><span>${esc(d.rot)}</span></th>`).join("");
  const cab2 = dims.map(d => INDS_DIM[d.id].map((i, k) => `<th class="${k ? "" : "ini"}"${tip(`<b>${IND[i].id}. ${esc(IND[i].rot)}</b><br>${esc(DIM_POR[IND[i].dim].rot)}`)}>${IND[i].id}</th>`).join("")).join("");
  const noEixo = E.eixoMat ? ` do eixo ${esc(EIXO_ROT[E.eixoMat])}` : "";
  const linhas = lista.map(m => {
    let cls = 0, q = 0, ep = 0;
    const tds = inds.map(i => { const v = m.c[i][S.av]; if(v != null){ cls++; if(v === 4) q++; if(v >= 2) ep++; }
      return `<td class="c ${v == null ? "nsi" : "n" + v}" data-i="${i}">${v == null ? "·" : NIV[v].cod}</td>`; }).join("");
    return `<tr data-cnes="${m.cnes}"><td class="col-unid"><button data-cnes="${m.cnes}">${esc(m.nome)}</button><small>${esc(m.municipio)}/${m.uf} · CNES ${m.cnes}</small></td>${tds}<td class="tot">${cls}</td><td class="tot ep-col">${ep}</td><td class="tot">${q}</td></tr>`;
  }).join("");
  $("matriz").innerHTML = `<thead><tr class="l1"><th class="col-unid" rowspan="2">Maternidade<br><small style="font-weight:600; color:#C5E3CC">${fmtInt(lista.length)} no quadro · ${esc(rotAv(S.av))}</small></th>${cab1}<th class="tot" rowspan="2"${tip(`Indicadores${noEixo} classificados na avaliação escolhida`)}>Classi-<br>ficados</th><th class="tot" rowspan="2"${tip(`Indicadores${noEixo} em processo de qualificação: Intermediário, Avançado ou Qualificado`)}>Em pro-<br>cesso</th><th class="tot" rowspan="2"${tip(`Indicadores${noEixo} no nível Qualificado`)}>Quali-<br>ficados</th></tr><tr class="l2">${cab2}</tr></thead><tbody>${linhas || `<tr><td class="col-unid" colspan="${inds.length + 4}">Nenhuma maternidade encontrada.</td></tr>`}</tbody>`;
  $("legendaMat").innerHTML = NIV.map((n, k) => `<span><i class="q n${k}"></i>${esc(n.cod)} = ${esc(n.rot)}</span>`).join("") + `<span><i class="q nsi"></i>· = Sem informação</span>`;
}
function csvMatriz(){
  const lista = matsQuadro();
  baixarCSV(`qualificacao_quadro_${AVS[S.av].n}a_avaliacao.csv`, [cabecalhoCSV(`${rotRecorte()} · ${rotAv(S.av)}`),
    ["CNES", "Maternidade", "Município", "UF", "Região", ...IND.map(i => `${i.id}. ${i.rot}`)],
    ...lista.map(m => [m.cnes, m.nome, m.municipio, m.uf, m.regiao, ...TODOS.map(i => nivelRot(m.c[i][S.av]))])]);
}
const CAB_LONGO = ["CNES", "Maternidade", "Nome no registro de acompanhamento", "Município", "UF", "Região", "Eixo", "Dimensão", "Nº", "Indicador", "Avaliação", "Período", "Nível"];
const linhasLongas = m => TODOS.flatMap(i => AVS.map((av, a) => [m.cnes, m.nome, m.nomePlanilha, m.municipio, m.uf, m.regiao, EIXO_ROT[IND[i].eixo], DIM_POR[IND[i].dim].rot, IND[i].id, IND[i].rot, av.rot, av.periodo, av.realizada ? nivelRot(m.c[i][a]) : "a realizar"]));
function montarMatriz(){
  const sel = $("selPerfil"), selPd = $("selPerfilPd");
  [sel, selPd].forEach(s => {
    if(s === sel) s.appendChild(new Option("escolha a maternidade…", ""));
    [...new Set(MAT.map(m => m.uf))].sort((a, b) => UF_NOME[a].localeCompare(UF_NOME[b], "pt-BR")).forEach(uf => {
      const g = document.createElement("optgroup"); g.label = UF_NOME[uf];
      MAT.filter(m => m.uf === uf).sort(porUFNome).forEach(m => g.appendChild(new Option(`${m.nome} · ${m.municipio}`, m.cnes))); s.appendChild(g); });
  });
  sel.addEventListener("change", () => { if(sel.value) abrirPerfil(sel.value); sel.value = ""; });
  $("buscaMat").addEventListener("input", e => { E.busca = e.target.value; renderMatriz(); });
  segmento("segOrdem", d => { E.ordem = d.ordem; renderMatriz(); });
  $("segEixoMat").innerHTML = `<button data-eixo="" class="ativo">Todos</button>` + EIX.map(e => `<button data-eixo="${e.id}">${esc(e.rot)}</button>`).join("");
  segmento("segEixoMat", d => { E.eixoMat = d.eixo; renderMatriz(); });
  $("btnCsvMatriz").addEventListener("click", csvMatriz);
  $("btnCsvTudo").addEventListener("click", () => baixarCSV("qualificacao_todas_as_avaliacoes.csv", [cabecalhoCSV(rotRecorte()), CAB_LONGO, ...recorte().sort(porUFNome).flatMap(linhasLongas)]));
  $("listaNumerada").innerHTML = DIM.map(d => `<p style="break-inside:avoid; margin-bottom:.6rem"><b style="color:var(--texto)">${esc(EIXO_ROT[d.eixo])} · ${esc(d.rot)}</b><br>${INDS_DIM[d.id].map(i => `${IND[i].id}. ${esc(IND[i].rot)}`).join("<br>")}</p>`).join("");
}

/* ============================================================
   5. MUDANÇAS DE NÍVEL
   ============================================================ */
function mudancas(mats, a, b){
  const T = NIV.map(() => NIV.map(() => 0));
  const r = {T, comp: 0, av: 0, rec: 0, ig: 0, outra: 0, porMat: [], porInd: IND.map(() => ({comp: 0, av: 0, rec: 0}))};
  for(const m of mats){
    const pm = {m, comp: 0, av: 0, rec: 0, saldo: 0};
    TODOS.forEach(i => {
      const x = m.c[i][a], y = m.c[i][b]; if(x == null || y == null) return;
      r.comp++; pm.comp++; r.porInd[i].comp++; T[x][y]++;
      if(x === y) r.ig++;
      else if(x === 0 || y === 0) r.outra++;
      else if(y > x){ r.av++; pm.av++; pm.saldo += y - x; r.porInd[i].av++; }
      else { r.rec++; pm.rec++; pm.saldo += y - x; r.porInd[i].rec++; }
    });
    r.porMat.push(pm);
  }
  return r;
}
/* resumo no formato da coordenação: níveis nas duas avaliações, soma e percentual em processo de qualificação */
function renderResumo(mats){
  const inds = indsEscopo(E.escopoRes), a = dist(mats, inds, E.de), b = dist(mats, inds, E.para), ea = emProc(a), eb = emProc(b);
  const dif = (x, y) => { const v = y - x; return v === 0 ? "0" : (v > 0 ? "+" : "−") + fmtInt(Math.abs(v)); };
  const lin = (cls, rot, x, y, v) => `<tr class="${cls}"><td>${rot}</td><td class="r">${x}</td><td class="r">${y}</td><td class="r">${v}</td></tr>`;
  const pp = ea.pct == null || eb.pct == null ? "—" : (() => { const v = Math.round((eb.pct - ea.pct) * 10) / 10; return (v > 0 ? "+" : v < 0 ? "−" : "") + fmt1(Math.abs(v)) + " p.p."; })();
  const cab = i => `<th class="r">${esc(AVS[i].rot)}<br><small style="font-weight:600; color:#C5E3CC">${esc(AVS[i].periodo)}</small></th>`;
  $("tabResumo").innerHTML = `<thead><tr><th>${esc(rotEscopo(E.escopoRes))}</th>${cab(E.de)}${cab(E.para)}<th class="r">Variação</th></tr></thead><tbody>` +
    [1, 2, 3, 4].map(k => lin("", `<i class="q n${k}" style="vertical-align:-2px"></i> ${esc(NIV[k].rot)}`, fmtInt(a.n[k]), fmtInt(b.n[k]), dif(a.n[k], b.n[k]))).join("") +
    lin("soma", "Total", fmtInt(ea.den), fmtInt(eb.den), dif(ea.den, eb.den)) +
    lin("soma", "Intermediário + Avançado + Qualificado", fmtInt(ea.num), fmtInt(eb.num), dif(ea.num, eb.num)) +
    lin("ep-linha", EP_ROT, epTxt(a), epTxt(b), pp) + `</tbody>`;
  $("notaResumo").innerHTML = `${esc(rotRecorte())}. O total reúne os itens nos quatro níveis listados. Não entram no cálculo, na ordem das duas avaliações, os itens em "Não se Aplica" (${fmtInt(a.n[0])} e ${fmtInt(b.n[0])}) e os itens sem informação (${fmtInt(a.si)} e ${fmtInt(b.si)}).`;
}
function renderMud(){
  const mats = recorte();
  renderResumo(mats);
  if(E.de === E.para){
    $("kpisMud").innerHTML = `<div class="k"><div class="s">Escolha duas avaliações diferentes para comparar.</div></div>`;
    $("transicao").innerHTML = ""; $("tabMudInd").innerHTML = ""; $("tabMudMat").innerHTML = ""; return;
  }
  const r = mudancas(mats, E.de, E.para);
  const k = (n, t, s) => `<div class="k"><div class="n">${n}</div><div class="t">${t}</div><div class="s">${s}</div></div>`;
  $("kpisMud").innerHTML = k(fmtInt(r.comp), "Itens comparáveis", `classificados na ${AVS[E.de].n}ª e na ${AVS[E.para].n}ª avaliação · ${esc(rotRecorte())}`) +
    k(fmtInt(r.av), "Avançaram de nível", `${pct(r.av, r.comp)} dos comparáveis`) +
    k(fmtInt(r.rec), "Recuaram de nível", `${pct(r.rec, r.comp)} dos comparáveis`) +
    k(fmtInt(r.ig), "Mantiveram o nível", `${pct(r.ig, r.comp)} dos comparáveis`) +
    (r.outra ? k(fmtInt(r.outra), "Outras mudanças", `de ou para "Não se Aplica"`) : "");
  /* matriz de transição: verde = avanço, vermelho = recuo, cinza = manteve ou envolve "Não se Aplica" */
  const maxFora = Math.max(1, ...r.T.flatMap((l, x) => l.filter((_, y) => y !== x)));
  const cel = (x, y) => {
    const q = r.T[x][y]; let st = "";
    if(q && x !== y && x !== 0 && y !== 0){ const al = (.14 + .6 * q / maxFora).toFixed(2); st = y > x ? `background:rgba(39,146,97,${al})` : `background:rgba(192,57,43,${al})`; }
    else if(q && x === y) st = "background:#DDE4E0";
    return `<td class="${q ? "" : "zero"}" style="${st}"${tip(`De <b>${esc(NIV[x].rot)}</b> para <b>${esc(NIV[y].rot)}</b>: ${plural(q, "item", "itens")}`)}>${fmtInt(q)}</td>`;
  };
  $("transicao").innerHTML = `<div style="overflow-x:auto"><table class="trans"><thead><tr><th class="lin-rot">${AVS[E.de].n}ª ↓ · ${AVS[E.para].n}ª →</th>${NIV.map((n, y) => `<th><i class="q n${y}" style="vertical-align:-2px"></i><br>${esc(n.rot)}</th>`).join("")}</tr></thead><tbody>` +
    NIV.map((n, x) => `<tr><th class="lin-rot"><i class="q n${x}" style="vertical-align:-2px"></i> ${esc(n.rot)}</th>${NIV.map((_, y) => cel(x, y)).join("")}</tr>`).join("") + `</tbody></table></div>
    <div class="legenda"><span><i class="q" style="background:rgba(39,146,97,.6)"></i>avanço</span><span><i class="q" style="background:rgba(192,57,43,.6)"></i>recuo</span><span><i class="q" style="background:#DDE4E0"></i>manteve o nível</span></div>`;
  const pi = TODOS.map(i => ({i, ...r.porInd[i]})).filter(x => x.comp).sort((a, b) => b.av - a.av || a.rec - b.rec || a.i - b.i);
  $("tabMudInd").innerHTML = `<thead><tr><th>Indicador</th><th class="r">Comparáveis</th><th class="r">Avançaram</th><th class="r">Recuaram</th></tr></thead><tbody>` +
    (pi.map(x => `<tr><td>${IND[x.i].id}. ${esc(IND[x.i].rot)}<br><small>${esc(DIM_POR[IND[x.i].dim].rot)}</small></td><td class="r">${fmtInt(x.comp)}</td><td class="r">${x.av ? `<span class="seta-av">▲ ${fmtInt(x.av)}</span>` : "0"}</td><td class="r">${x.rec ? `<span class="seta-rec">▼ ${fmtInt(x.rec)}</span>` : "0"}</td></tr>`).join("") || `<tr><td colspan="4">Sem itens comparáveis neste recorte.</td></tr>`) + `</tbody>`;
  const pm = r.porMat.slice().sort((a, b) => b.av - a.av || b.saldo - a.saldo || porUFNome(a.m, b.m));
  $("tabMudMat").innerHTML = `<thead><tr><th>Maternidade</th><th>UF</th><th class="r">Itens comparáveis</th><th class="r">Avançaram</th><th class="r">Recuaram</th><th class="r">Saldo de níveis</th></tr></thead><tbody>` +
    pm.map(x => `<tr><td><button class="lk" data-cnes="${x.m.cnes}">${esc(x.m.nome)}</button><br><small>${esc(x.m.municipio)}</small></td><td>${x.m.uf}</td><td class="r">${fmtInt(x.comp)}</td><td class="r">${x.av ? `<span class="seta-av">▲ ${fmtInt(x.av)}</span>` : "0"}</td><td class="r">${x.rec ? `<span class="seta-rec">▼ ${fmtInt(x.rec)}</span>` : "0"}</td><td class="r">${x.saldo > 0 ? "+" : x.saldo < 0 ? "−" : ""}${fmtInt(Math.abs(x.saldo))}</td></tr>`).join("") + `</tbody>`;
}
function montarMud(){
  const sr = $("selEscopoRes"); sr.innerHTML = $("selEscopo").innerHTML; sr.value = E.escopoRes;
  sr.addEventListener("change", () => { E.escopoRes = sr.value; renderResumo(recorte()); });
  [["selDe", "de"], ["selPara", "para"]].forEach(([id, chave]) => {
    const s = $(id); REALIZADAS.forEach(i => s.appendChild(new Option(rotAv(i), i))); s.value = E[chave];
    s.addEventListener("change", () => { E[chave] = +s.value; renderMud(); });
  });
}

/* ============================================================
   6. PREENCHIMENTO — % de itens classificados por grupo da planilha e dimensão (sempre o país inteiro)
   ============================================================ */
const RAMPA = ["#E4F3E8", "#BFE3CB", "#8FCFA6", "#4FA97B", "#1B5F51"];
function celPre(mats, inds, rot){
  const d = dist(mats, inds, S.av), p = d.total ? d.cls / d.total * 100 : 0;
  const k = Math.min(4, Math.floor(p / 20.0001));
  const st = d.cls ? `background:${RAMPA[k]}; color:${k >= 3 ? "#FFF" : "var(--texto)"}` : "color:#9FB0A6";
  return `<td class="c" style="${st}; font-variant-numeric:tabular-nums"${tip(`<b>${esc(rot)}</b><br>${fmtInt(d.cls)} de ${fmtInt(d.total)} itens classificados`)}><b>${Math.round(p)}%</b></td>`;
}
function renderPre(){
  const linhas = [...GRP.map(g => ({rot: g.rot, sub: "", mats: MAT.filter(m => m.aba === g.aba), cls: ""})), {rot: "Brasil", sub: "", mats: MAT, cls: "br"}];
  $("tabPre").innerHTML = `<thead><tr><th>Grupo de estados</th><th class="r">Maternidades</th>${DIM.map(d => `<th class="c" style="white-space:normal; overflow-wrap:anywhere; min-width:96px; max-width:128px"${tip(`<b>${esc(EIXO_ROT[d.eixo])}</b><br>${esc(d.rot)} · ${plural(INDS_DIM[d.id].length, "indicador", "indicadores")}`)}>${esc(d.rot)}</th>`).join("")}<th class="c">Todos</th></tr></thead><tbody>` +
    linhas.map(l => `<tr class="${l.cls}"><td>${esc(l.rot)}${l.sub ? ` <small>${esc(l.sub)}</small>` : ""}</td><td class="r">${fmtInt(l.mats.length)}</td>${DIM.map(d => celPre(l.mats, INDS_DIM[d.id], `${l.rot} · ${d.rot}`)).join("")}${celPre(l.mats, TODOS, `${l.rot} · todos os indicadores`)}</tr>`).join("") + `</tbody>`;
}

/* ============================================================
   7. PERFIL DA UNIDADE (página sobreposta)
   ============================================================ */
let perfilAtual = null;
function mudancaItem(x, y){
  if(x == null || y == null) return `<span class="suave">—</span>`;
  if(x === y) return `<span class="suave">=</span>`;
  if(x === 0 || y === 0) return `<span class="suave">mudou</span>`;
  const n = Math.abs(y - x);
  return y > x ? `<span class="seta-av">▲ ${plural(n, "nível", "níveis")}</span>` : `<span class="seta-rec">▼ ${plural(n, "nível", "níveis")}</span>`;
}
function abrirPerfil(cnes){
  const m = MAT_POR[cnes]; if(!m) return;
  perfilAtual = m;
  const d = dist([m], TODOS, ULT), mu = mudancas([m], PRIM, ULT);
  const chip = v => `<span class="nivel ${v == null ? "nsi" : "n" + v}">${v == null ? "sem informação" : esc(NIV[v].rot)}</span>`;
  const nInd = dd => `<b>${dd.cls}</b> de ${dd.total}<br>classificados`;
  /* evolução: uma barra por avaliação realizada, para um conjunto de indicadores */
  const evol = inds => REALIZADAS.map(a => { const dd = dist([m], inds, a); return linBarra(a === ULT ? "atual" : "", AVS[a].rot, AVS[a].periodo, dd, "n", nInd(dd)); }).join("");
  const tabela = e => `<div style="overflow-x:auto; margin-top:.7rem"><table class="perfil">
      <thead><tr><th>Nº</th><th>Indicador</th>${AVS.map(a => `<th>${esc(a.rot)}<small>${esc(a.periodo)}${a.realizada ? "" : " · a realizar"}</small></th>`).join("")}<th>Mudança<small>${AVS[PRIM].n}ª → ${AVS[ULT].n}ª</small></th></tr></thead>
      <tbody>${DIM.filter(dm => dm.eixo === e.id).map(dm => `<tr class="g"><td colspan="${AVS.length + 3}">${esc(dm.rot)}</td></tr>` +
        INDS_DIM[dm.id].map(i => `<tr><td class="num">${IND[i].id}</td><td${IND[i].texto !== IND[i].rot ? tip(esc(IND[i].texto)) : ""}>${esc(IND[i].rot)}</td>${AVS.map((av, a) => `<td class="cn">${av.realizada ? chip(m.c[i][a]) : `<span class="suave">—</span>`}</td>`).join("")}<td class="cn">${mudancaItem(m.c[i][PRIM], m.c[i][ULT])}</td></tr>`).join("")).join("")}</tbody></table></div>`;
  const blocoEixo = e => { const dimsE = DIM.filter(dm => dm.eixo === e.id);
    return `<div class="eixo-faixa eixo-${e.id}"><span>${esc(e.rot)}</span><small>${plural(INDS_EIXO[e.id].length, "indicador", "indicadores")} em ${plural(dimsE.length, "dimensão", "dimensões")}</small></div>
      <div class="card bloco-eixo eixo-${e.id}">${cabEixo(e, "Evolução em " + e.rot, "perfil:" + e.id)}
        <p class="sub">Cada barra reúne os indicadores do eixo em uma avaliação. O número em cada cor é a quantidade de indicadores naquele nível.</p>
        <div class="linhas">${evol(INDS_EIXO[e.id])}</div>
        <p class="grupo-tit" style="margin-top:1.3rem">Evolução em cada dimensão</p>
        <div class="mini-grid">${dimsE.map(dm => `<div class="mini"><p class="mini-tit">${esc(dm.rot)}</p>${REALIZADAS.map(a => { const dd = dist([m], INDS_DIM[dm.id], a);
          return `<div class="mini-lin"><span${tip(esc(rotAv(a)))}>${AVS[a].n}ª</span>${pilha(dd, "n")}${epChip(dd)}</div>`; }).join("")}</div>`).join("")}</div>
      </div>
      <div class="card bloco-eixo eixo-${e.id}"><h3>${esc(e.rot)}: nível de cada indicador nas avaliações</h3>
        <p class="sub">A última coluna compara a ${AVS[PRIM].n}ª com a ${AVS[ULT].n}ª avaliação.</p>${tabela(e)}</div>`; };
  $("perfilConteudo").innerHTML = `
    <div class="perfil-topo">
      <div>
        <p class="eyebrow" style="color:#C5E3CC">Perfil da unidade · Painel de Qualificação</p>
        <h2 style="margin-top:.4rem; color:#FFF">${esc(m.nome)}</h2>
        <div class="meta">
          <span>${esc(m.municipio)} · ${esc(UF_NOME[m.uf])}</span><span>Região ${esc(m.regiao)}</span><span class="mono">CNES ${m.cnes}</span><span>Grupo ${esc(m.grupo)}</span>
        </div>
        ${normTxt(m.nomePlanilha) !== normTxt(m.nome) ? `<p style="margin-top:.6rem; font-size:.82rem; color:#C5E3CC">Nome no registro de acompanhamento: ${esc(m.nomePlanilha)}</p>` : ""}
      </div>
      <div class="kpis-topo">
        <div class="k"><div class="n">${d.cls} de ${IND.length}</div><div class="t">indicadores classificados</div></div>
        <div class="k"><div class="n">${epTxt(d)}</div><div class="t">em processo de qualificação</div></div>
        <div class="k"><div class="n">${d.n[4]}</div><div class="t">em Qualificado</div></div>
        <div class="k"><div class="n">${d.n[1]}</div><div class="t">em Não Iniciado</div></div>
        <div class="k"><div class="n">▲ ${mu.av} · ▼ ${mu.rec}</div><div class="t">avanços e recuos desde a ${AVS[PRIM].n}ª</div></div>
      </div>
    </div>
    <p class="suave" style="font-size:.8rem; margin-top:.6rem">Números do quadro acima: ${esc(rotAv(ULT))}, última avaliação realizada. Avanços e recuos comparam a ${AVS[PRIM].n}ª e a ${AVS[ULT].n}ª avaliação.</p>
    <div class="perfil-cards">
      <div class="card">
        <div class="eixo-cab"><h3>Evolução da unidade nas avaliações</h3><span class="chip">${IND.length} indicadores</span><button class="chip chip-botao png" data-png="perfil:geral" title="Baixar este gráfico em PNG">⬇ PNG</button></div>
        <p class="sub">Uma barra para cada avaliação realizada. O número em cada cor é a quantidade de indicadores naquele nível; o valor em azul-claro é o percentual em processo de qualificação.</p>
        <div class="linhas">${evol(TODOS)}</div>
        <div class="legenda">${legendaHtml(true)}</div>
      </div>
      ${EIX.map(blocoEixo).join("")}
      <p class="fonte">Fonte: acompanhamento trimestral da coordenação, dados de ${dataBR(DADOS.fonte.modificadoEm)}. Dados sujeitos a revisão.
        <a href="${HAB_URL}#${m.cnes}" target="_blank" rel="noopener">Ver as habilitações desta unidade no CNES (Painel de Habilitações) →</a></p>
    </div>`;
  $("selPerfilPd").value = cnes;
  $("paginaPerfil").hidden = false; $("paginaPerfil").scrollTop = 0;
  document.body.classList.add("perfil-aberto");
  if(location.hash !== "#" + cnes) history.replaceState(null, "", "#" + cnes);
}
function fecharPerfil(){
  $("paginaPerfil").hidden = true; document.body.classList.remove("perfil-aberto"); perfilAtual = null;
  if(location.hash) history.replaceState(null, "", location.pathname + location.search);
}
function montarPerfil(){
  $("btnVoltar").addEventListener("click", fecharPerfil);
  $("btnPdfPerfil").addEventListener("click", () => window.print());
  $("btnCsvPerfil").addEventListener("click", () => { if(perfilAtual) baixarCSV(`qualificacao_${perfilAtual.cnes}.csv`, [cabecalhoCSV(`${perfilAtual.nome} (CNES ${perfilAtual.cnes})`), CAB_LONGO, ...linhasLongas(perfilAtual)]); });
  $("selPerfilPd").addEventListener("change", e => abrirPerfil(e.target.value));
  document.addEventListener("keydown", e => { if(e.key === "Escape" && perfilAtual) fecharPerfil(); });
  /* qualquer botão com data-cnes abre o perfil */
  document.addEventListener("click", e => { const b = e.target.closest("button[data-cnes]"); if(b) abrirPerfil(b.dataset.cnes); });
  const abrirDoHash = () => { const h = location.hash.replace("#", ""); if(/^\d{7}$/.test(h) && MAT_POR[h]) abrirPerfil(h); };
  window.addEventListener("hashchange", abrirDoHash); abrirDoHash();
}

/* ============================================================
   8. GRÁFICOS EM PNG - cada gráfico é redesenhado em SVG (título, barras, legenda e fonte) e convertido em imagem,
   como nos painéis do Indicadores_Brasil
   ============================================================ */
function quebraTexto(txt, max){
  if(txt.length <= max) return [txt];
  const i = txt.lastIndexOf(" ", max), a = txt.slice(0, i > 0 ? i : max), b = txt.slice(i > 0 ? i + 1 : max);
  return [a, b.length > max ? b.slice(0, max - 1) + "…" : b];
}
function svgGrafico({titulo, subtitulo, linhas, modo}){
  const W = 1280, mL = 440, mR = 250, bw = W - mL - mR, lh = 52, bh = 32, topo = 108;
  const H = topo + linhas.reduce((s, l) => s + (l.grupo ? 42 : lh), 0) + 132;
  const claro = k => k === 0 || k === 2;
  let y = topo;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif">` +
    `<defs><pattern id="hach" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#F4F7F5"/><rect width="4" height="8" fill="#E3EAE6"/></pattern></defs>` +
    `<rect width="${W}" height="${H}" fill="#FFFFFF"/><rect width="${W}" height="8" fill="#279261"/>` +
    `<text x="36" y="54" font-size="${titulo.length > 72 ? 21 : 26}" font-weight="800" fill="#0A213D">${esc(titulo)}</text><text x="36" y="82" font-size="16" fill="#4E6A5C">${esc(subtitulo)}</text>`;
  linhas.forEach(l => {
    if(l.grupo){ s += `<text x="36" y="${y + 28}" font-size="15" font-weight="800" fill="#1B5F51">${esc(l.grupo.toUpperCase())}</text>`; y += 42; return; }
    const d = l.d, base = modo === "n" ? d.total : d.cls, rot = quebraTexto(l.rot, 52), duas = rot.length > 1 || !!l.sub;
    s += `<text x="${mL - 16}" y="${y + (duas ? 14 : 21)}" text-anchor="end" font-size="15" font-weight="${l.forte ? 800 : 600}" fill="#1D3229">${esc(rot[0])}</text>`;
    if(rot.length > 1) s += `<text x="${mL - 16}" y="${y + 31}" text-anchor="end" font-size="15" font-weight="${l.forte ? 800 : 600}" fill="#1D3229">${esc(rot[1])}</text>`;
    else if(l.sub) s += `<text x="${mL - 16}" y="${y + 31}" text-anchor="end" font-size="12" fill="#4E6A5C">${esc(l.sub)}</text>`;
    if(!base) s += `<rect x="${mL}" y="${y}" width="${bw}" height="${bh}" rx="5" fill="url(#hach)" stroke="#D8E8DC"/><text x="${mL + bw / 2}" y="${y + 21}" text-anchor="middle" font-size="13" fill="#4E6A5C">${esc(l.vazio || "sem informação")}</text>`;
    else {
      let x = mL;
      const segs = NIV.map((nv, k) => ({q: d.n[k], cor: nv.cor, k})).filter(g => g.q);
      if(modo === "n" && d.si) segs.push({q: d.si, cor: "url(#hach)", k: -1});
      /* toda faixa leva o seu rótulo: as estreitas ganham a largura mínima do rótulo e as demais cedem espaço */
      segs.forEach(g => { g.rot = g.k < 0 ? fmtInt(g.q) : rotFaixa(g.q, d.cls, modo); g.min = g.rot.length * 9 + 12; g.w = g.q / base * bw; g.fixa = false; });
      for(let mudou = true; mudou;){ mudou = false;
        const livre = bw - segs.filter(g => g.fixa).reduce((t, g) => t + g.min, 0), qLivre = segs.filter(g => !g.fixa).reduce((t, g) => t + g.q, 0);
        segs.forEach(g => { if(g.fixa) g.w = g.min; else { g.w = g.q / qLivre * livre; if(g.w < g.min){ g.fixa = true; mudou = true; } } }); }
      segs.forEach(g => { const w = g.w;
        s += `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(1, w - 2).toFixed(1)}" height="${bh}" rx="3" fill="${g.cor}"${g.k < 0 ? ' stroke="#D8E8DC"' : ""}/>`;
        s += `<text x="${(x + (w - 2) / 2).toFixed(1)}" y="${y + 21}" text-anchor="middle" font-size="13" font-weight="800" fill="${g.k < 0 ? "#4E6A5C" : claro(g.k) ? "#1D3229" : "#FFFFFF"}">${esc(g.rot)}</text>`;
        x += w; });
    }
    const e = emProc(d);
    if(base) s += `<rect x="${mL + bw + 14}" y="${y + 3}" width="80" height="26" rx="13" fill="#DCEBF7" stroke="#A9CBE8"/><text x="${mL + bw + 54}" y="${y + 21}" text-anchor="middle" font-size="13" font-weight="800" fill="#0A213D">${e.pct == null ? "—" : fmt1(e.pct) + "%"}</text>`;
    if(l.nota) s += `<text x="${mL + bw + 104}" y="${y + 21}" font-size="12" fill="#4E6A5C">${esc(l.nota)}</text>`;
    y += lh;
  });
  let lx = 36; const ly = y + 24;
  NIV.forEach(nv => { s += `<rect x="${lx}" y="${ly - 12}" width="14" height="14" rx="3" fill="${nv.cor}"/><text x="${lx + 20}" y="${ly}" font-size="13" fill="#4E6A5C">${esc(nv.rot)}</text>`; lx += 36 + nv.rot.length * 7.4; });
  if(modo === "n") s += `<rect x="${lx}" y="${ly - 12}" width="14" height="14" rx="3" fill="url(#hach)" stroke="#D8E8DC"/><text x="${lx + 20}" y="${ly}" font-size="13" fill="#4E6A5C">Sem informação</text>`;
  s += `<rect x="36" y="${ly + 12}" width="34" height="18" rx="9" fill="#DCEBF7" stroke="#A9CBE8"/><text x="53" y="${ly + 26}" text-anchor="middle" font-size="12" font-weight="800" fill="#0A213D">%</text><text x="78" y="${ly + 26}" font-size="13" fill="#4E6A5C">${EP_ROT}: Intermediário + Avançado + Qualificado sobre o total dos quatro níveis</text>`;
  s += `<text x="36" y="${ly + 58}" font-size="12" fill="#4E6A5C">Painel de Qualificação · versão prévia · acompanhamento trimestral da coordenação, dados de ${dataBR(DADOS.fonte.modificadoEm)} · IFF/Fiocruz · dados sujeitos a revisão</text>`;
  return s + "</svg>";
}
function baixarPNG(svg, nome){
  const img = new Image();
  img.onload = () => {
    const k = 2, cv = document.createElement("canvas"); cv.width = img.width * k; cv.height = img.height * k;
    const g = cv.getContext("2d"); g.scale(k, k); g.drawImage(img, 0, 0);
    cv.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nome; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }, "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);   /* data: em vez de blob: para não bloquear o canvas no Safari */
}
const nomeArq = s => normTxt(s).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
/* dados de cada gráfico exportável, no estado atual do painel (recorte, avaliação, unidade aberta) */
function graficoParaPng(chave){
  const mats = recorte(), rec = rotRecorte(), av = rotAv(S.av), [tipo, arg] = chave.split(":");
  const itens = d => `${fmtInt(d.cls)} classificados`;
  if(tipo === "evolucao") return {nome: `qualificacao_evolucao_${nomeArq(rec)}`, titulo: "Evolução por avaliação", subtitulo: `${rec} · percentual dos itens classificados em cada nível`, modo: "pct",
    linhas: AVS.map((a, i) => { const d = dist(mats, TODOS, i); return {rot: a.rot, sub: a.periodo, d, nota: a.realizada ? itens(d) : "", vazio: a.realizada ? null : "a realizar"}; })};
  if(tipo === "eixo"){ const e = EIX.find(x => x.id === arg), de = dist(mats, INDS_EIXO[arg], S.av);
    return {nome: `qualificacao_${nomeArq(e.rot)}_${nomeArq(rec)}_${AVS[S.av].n}a`, titulo: `${e.rot}, por dimensão`, subtitulo: `${rec} · ${av} · percentual dos itens classificados em cada nível`, modo: "pct",
      linhas: [{rot: "Todas as dimensões do eixo", forte: true, d: de, nota: itens(de)}, ...DIM.filter(dm => dm.eixo === arg).map(dm => { const d = dist(mats, INDS_DIM[dm.id], S.av); return {rot: dm.rot, d, nota: itens(d)}; })]}; }
  if(tipo === "ind"){ const e = EIX.find(x => x.id === arg), linhas = [];
    DIM.filter(dm => dm.eixo === arg).forEach(dm => { linhas.push({grupo: dm.rot}); INDS_DIM[dm.id].forEach(i => { const d = dist(mats, [i], S.av); linhas.push({rot: `${IND[i].id}. ${IND[i].rot}`, d, nota: `${d.cls} de ${d.total} classificadas`}); }); });
    return {nome: `qualificacao_indicadores_${nomeArq(e.rot)}_${nomeArq(rec)}_${AVS[S.av].n}a`, titulo: `${e.rot}: maternidades em cada nível, por indicador`, subtitulo: `${rec} · ${av} · número de maternidades`, modo: "n", linhas}; }
  if(tipo === "local") return {nome: `qualificacao_local_${AVS[S.av].n}a`, titulo: E.modo === "grupos" ? "Classificação por grupo de estados" : "Classificação por região e por estado", subtitulo: `${rotEscopo()} · ${av} · percentual dos itens classificados em cada nível`, modo: "pct",
    linhas: linhasLocal().map(r => ({rot: (r.tipo === "uf" ? "· " : "") + r.rot, forte: r.tipo !== "uf", d: r.d, nota: plural(r.mats.length, "maternidade", "maternidades")}))};
  if(tipo === "perfil" && perfilAtual){ const m = perfilAtual;
    const ev = inds => REALIZADAS.map(a => { const d = dist([m], inds, a); return {rot: AVS[a].rot, sub: AVS[a].periodo, d, nota: `${d.cls} de ${d.total} classificados`}; });
    if(arg === "geral") return {nome: `qualificacao_${m.cnes}_evolucao`, titulo: m.nome, subtitulo: `${m.municipio}/${m.uf} · evolução dos ${IND.length} indicadores nas avaliações · número de indicadores em cada nível`, modo: "n", linhas: ev(TODOS)};
    const e = EIX.find(x => x.id === arg), linhas = [{grupo: "Todas as dimensões do eixo"}, ...ev(INDS_EIXO[arg])];
    DIM.filter(dm => dm.eixo === arg).forEach(dm => { linhas.push({grupo: dm.rot}); linhas.push(...ev(INDS_DIM[dm.id])); });
    return {nome: `qualificacao_${m.cnes}_${nomeArq(e.rot)}`, titulo: `${m.nome} · ${e.rot}`, subtitulo: `${m.municipio}/${m.uf} · evolução nas avaliações · número de indicadores em cada nível`, modo: "n", linhas}; }
  return null;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-png]"); if(!b) return; const g = graficoParaPng(b.dataset.png); if(g) baixarPNG(svgGrafico(g), g.nome + ".png"); });

/* ---------------- trilho lateral ---------------- */
const TRILHO = [
  {alvo: "secMapa", rot: "Mapa", ico: '<svg viewBox="0 0 24 24"><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>'},
  {alvo: "secGeral", rot: "Visão geral", ico: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'},
  {alvo: "secInd", rot: "Indicadores", ico: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>'},
  {alvo: "secLocal", rot: "Regiões e estados", ico: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'},
  {alvo: "secMat", rot: "Maternidades", ico: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>'},
  {alvo: "secMud", rot: "Mudanças de nível", ico: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M14 7h7v7"/></svg>'},
  {alvo: "secPre", rot: "Preenchimento", ico: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'},
  {alvo: "secNotas", rot: "Notas metodológicas", ico: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>'},
];
function montarTrilho(){
  const trilho = $("trilho");
  trilho.innerHTML = TRILHO.map(t => `<button data-alvo="${t.alvo}" data-rotulo="${t.rot}" aria-label="${t.rot}">${t.ico}</button>`).join("");
  trilho.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    const y = $(b.dataset.alvo).getBoundingClientRect().top + scrollY - $("recorte").offsetHeight + 1;
    scrollTo({top: y, behavior: "smooth"});
  }));
  const obs = new IntersectionObserver(es => es.forEach(e => { if(e.isIntersecting) trilho.querySelectorAll("button").forEach(b => b.classList.toggle("ativo", b.dataset.alvo === e.target.id)); }), {rootMargin: "-40% 0px -55% 0px"});
  TRILHO.forEach(t => obs.observe($(t.alvo)));
}

/* ---------------- início ---------------- */
function renderTudo(){
  sincronizaRecorte(); renderMapa(); renderGeral(); renderInd(); renderLocal(); renderMatriz(); renderMud(); renderPre();
}
montarCabecalho(); montarRecorte(); montarMapa(); montarLocal(); montarMatriz(); montarMud(); montarTrilho();
$("evolucao").addEventListener("click", e => { const b = e.target.closest("button[data-av]"); if(b){ S.av = +b.dataset.av; renderTudo(); } });
$("listaInd").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if(!b) return;
  const i = +b.dataset.i, topo = b.getBoundingClientRect().top;
  E.ind = E.ind === i ? null : i;                      // tocar de novo fecha
  renderInd();
  const novo = $("listaInd").querySelector(`button[data-i="${i}"]`);   // mantém a linha tocada no mesmo lugar da tela
  if(novo) window.scrollBy({top: novo.getBoundingClientRect().top - topo, behavior: "instant"});
});
renderTudo();
montarPerfil();
