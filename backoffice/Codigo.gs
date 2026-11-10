/**
 * Back office da CNET Logistics, Lda
 * ----------------------------------
 * App web (Google Apps Script) para LANÇAR dados nas folhas do Google Sheets.
 * A app de consulta (o site) continua só a ler — quem escreve é este back office.
 *
 * Instalação: ver backoffice/README.md
 */

/* IDs dos ficheiros no Drive (os mesmos que o site usa) */
var PLANO_ID = '1iLkuI2Lom-klgfCtcrfSJMvbitZpXpWGPzoSQjZ0G1I';   // CNET LOGISTICS MGMT
var ABAST_ID = '1bpq6tAXb40dbZ0G945FxKanbIipnRDStO_nhYuuaxKo';   // Planilha de Abastecimentos CNET

var FOLHA_VIAGENS  = 'Viagens';
var FOLHA_VIATURAS = 'Viaturas';
var FOLHA_GERAL    = 'Movimentos Geral';               // todos os movimentos da empresa
var FOLHA_MOVS     = 'Movimentos dos Investidores';    // só o que passa pelos sócios
var FOLHA_MOVS_ALT = 'Movimentos Investimentos';       // nome antigo, se ainda não renomeaste
var FOLHA_SOCIOS   = 'Sócios - Contas Correntes';

/* Quem pagou, quando não foi um sócio (sai da conta da empresa). */
var PAGADOR_EMPRESA = 'Empresa';

/* Categoria com que um abastecimento entra no livro geral. */
var CATEGORIA_COMBUSTIVEL = 'Combustível';

/* Tipos que o formulário «Contas» oferece (livro geral). */
var TIPOS = ['Despesa', 'Recebimento', 'Investimento', 'Suprimento'];

/* Tipos que o formulário «Sócios» oferece (livro dos investidores).

   CAPITAL — o que fica na empresa e conta para as quotas. Devolução de
   capital e Dividendo são dinheiro que sai para o sócio: a app desconta-os
   ao que ele tem investido. */
var TIPOS_CAPITAL = ['Investimento', 'Suprimento', 'Devolução de capital', 'Dividendo'];

/* ADIANTAMENTOS — dinheiro que tem de voltar, nos dois sentidos. Ficam fora
   do capital (não mexem nas quotas) e fora do resultado (não são receita nem
   despesa), mas passam pela caixa/banco da empresa.
   «Despesa paga pelo sócio» não está na lista: é criada sozinha quando se
   lança uma despesa (ou um abastecimento) com Meio = Sócio. */
var TIPOS_ADIANTAMENTO = ['Adiantamento do sócio', 'Devolução ao sócio',
                          'Adiantamento ao sócio', 'Devolução do sócio'];
var TIPO_DESPESA_SOCIO = 'Despesa paga pelo sócio';

var TIPOS_INVESTIDORES = TIPOS_CAPITAL.concat(TIPOS_ADIANTAMENTO);

/* Despesa paga do bolso de um sócio: fica como uma destas duas coisas.
   Adiantamento → a empresa devolve-lhe (ou abate ao que ele tinha levado).
   Investimento → fica como capital e conta para as quotas. */
var FICA_ADIANTAMENTO = 'Adiantamento';
var FICA_INVESTIMENTO = 'Investimento';

/* Valor acordado com o cliente para a viagem. A coluna é criada na folha
   Viagens na primeira viagem que o tiver. */
var COL_COMBINADO = 'Valor Combinado (MZN)';
/* «Valor Rate» é o nome usado na folha Viagens; os outros ficam como alternativa */
var RE_COMBINADO = /valor\s*(combinado|(do\s*|da\s*)?rate)|^rate|\brate\b|tarifa|pre[çc]o\s*(acordado|combinado)/i;

/* Recibos que o motorista tem de entregar para justificar as despesas da
   viagem. As diárias não têm recibo. */
var COL_RECIBO = 'Recibo';
var RECIBO_ENTREGUE = 'Entregue';
var RECIBO_PENDENTE = 'Por entregar';
function precisaRecibo_(categoria) {
  var c = semAcentos_(categoria);
  if (/diari/.test(c)) return false;
  return /combust|manuten|portage|estadia|alojament|hotel|pernoit|parque|oficina|pneu/.test(c);
}

/* Faturação: só se REGISTAM aqui as faturas emitidas noutro lado (livro ou
   programa do contabilista). Uma viagem por fatura. Valores SEM IVA — o IVA
   não é contabilizado nesta app. */
var FOLHA_FATURAS = 'Faturas';
var COLUNAS_FATURAS = ['Nº Fatura', 'Data', 'Cliente', 'VF', 'Valor (MZN)', 'Vencimento', 'Nota'];
var PRAZO_PAGAMENTO_DIAS = 30;     // vencimento sugerido

/* Conta do motorista numa viagem. O dinheiro adiantado fica à guarda dele;
   as despesas que paga com esse dinheiro levam Meio = Motorista; o que
   sobra volta à caixa ou ao banco. Saldo a prestar contas =
   adiantado − justificado (diárias + despesas com recibo entregue) − devolvido. */
var TIPO_ADIANT_MOTORISTA = 'Adiantamento ao motorista';
var TIPO_DEVOL_MOTORISTA  = 'Devolução do motorista';
var MEIO_MOTORISTA        = 'Motorista';
function classeMotorista_(tipo) {
  var t = semAcentos_(tipo);
  if (/^adiantamento (ao|para o) motorista/.test(t)) return 'ad';
  if (/^(devolucao|reembolso) (do|pelo) motorista/.test(t)) return 'dev';
  return null;
}

/* Categorias sugeridas mesmo antes de existirem no histórico. */
var CATEGORIAS_BASE = ['Combustível', 'Portagens', 'Manutenção', 'Estadias', 'Diárias', 'Parqueamento', 'Despesas extras'];

/* Quem pode lançar dados. Lista vazia = qualquer pessoa com o link
   (só faz sentido se a app for publicada apenas para a organização). */
var EMAILS_AUTORIZADOS = [
  'nunotiago.mz@gmail.com'
];

/* ---------------------------------------------------------------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Formulario')
    .setTitle('CNET Logistics · Lançamentos')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function verificarAcesso_() {
  if (!EMAILS_AUTORIZADOS.length) return;
  var email = Session.getActiveUser().getEmail();
  if (EMAILS_AUTORIZADOS.indexOf(email) === -1) {
    throw new Error('Sem permissão para lançar dados (' + (email || 'sessão desconhecida') + ').');
  }
}

function folha_(fileId, nome) {
  var sh = SpreadsheetApp.openById(fileId).getSheetByName(nome);
  if (!sh) throw new Error('Folha «' + nome + '» não encontrada.');
  return sh;
}

/** A primeira das folhas indicadas que exista (para nomes antigos). */
function folhaEntre_(fileId, nomes) {
  var ss = SpreadsheetApp.openById(fileId);
  for (var i = 0; i < nomes.length; i++) {
    var sh = ss.getSheetByName(nomes[i]);
    if (sh) return sh;
  }
  throw new Error('Nenhuma destas folhas existe: ' + nomes.join(', ') + '.');
}

/** Cabeçalhos de uma folha (1.ª linha preenchida, até 10 linhas). */
function cabecalho_(sh) {
  var valores = sh.getRange(1, 1, Math.min(10, sh.getLastRow() || 1), sh.getLastColumn() || 1).getValues();
  for (var i = 0; i < valores.length; i++) {
    var preenchidas = valores[i].filter(function (c) { return String(c).trim(); }).length;
    if (preenchidas >= 2) return { linha: i + 1, cols: valores[i].map(function (c) { return String(c).trim(); }) };
  }
  return { linha: 1, cols: [] };
}

/**
 * Cabeçalho de uma folha de abastecimentos, encontrado pelos NOMES das
 * colunas (Data, Litros, Preço, Valor, Km, Local, Bomba). Nem a regra do
 * cabecalho_ (primeira linha com 2 células — apanharia «Viagem | VF56» do
 * bloco de título) nem «a linha mais cheia» servem: um abastecimento com um
 * valor solto numa coluna sem título ficava mais cheio do que o cabeçalho, e
 * o lançamento seguinte era gravado como uma linha vazia.
 * A mesma regra está na app (linhaCabecalhoAbast em index.html).
 */
var RE_CAB_ABAST = /^(data|local|bomba|posto|litros?|pre[çc]o|valor|montante|total|km|kms|quil[óo]metr|od[óo]metro|conta)/i;
function cabecalhoAbast_(sh) {
  var n = Math.min(12, sh.getLastRow() || 1);
  var valores = sh.getRange(1, 1, n, sh.getLastColumn() || 1).getValues();
  for (var i = 0; i < valores.length; i++) {
    var conhecidas = valores[i].filter(function (c) { return RE_CAB_ABAST.test(String(c).trim()); }).length;
    if (conhecidas >= 3) {
      return { linha: i + 1, cols: valores[i].map(function (c) { return String(c).trim(); }) };
    }
  }
  return { linha: 1, cols: [] };
}

/** Número à portuguesa: aceita "82,5", "1 234,56" e também o ponto. */
function num_(v) {
  if (typeof v === 'number') return v;
  var t = String(v == null ? '' : v).replace(/[\s\u00a0]/g, '');
  if (!t) return 0;
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

/** minúsculas e sem acentos, para comparar nomes e tipos */
function semAcentos_(t) {
  return String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Classe de um tipo de adiantamento, ou null se for capital/outro.
 *   do      sócio → empresa (a empresa fica a dever)
 *   despesa sócio pagou do bolso uma despesa da empresa (idem)
 *   devDo   sócio devolve o que tinha levado
 *   ao      empresa → sócio (o sócio fica a dever)
 *   devAo   empresa devolve ao sócio o que ele adiantou
 * A mesma regra está na app (classeAdiant em index.html).
 */
function classeAdiant_(tipo) {
  var s = semAcentos_(tipo);
  if (!s) return null;
  if (/^adiantamento (do|pelo|de) socio/.test(s)) return 'do';
  if (/^adiantamento (ao|para o|a) socio/.test(s)) return 'ao';
  if (/^(devolucao|reembolso) ao socio/.test(s)) return 'devAo';
  if (/^(devolucao|reembolso) (do|pelo) socio/.test(s)) return 'devDo';
  if (/^despesa (paga )?(pelo|do) socio/.test(s)) return 'despesa';
  return null;
}
/* efeito no saldo do sócio: positivo = a empresa deve-lhe */
var SINAL_ADIANT = { 'do': 1, despesa: 1, devDo: 1, ao: -1, devAo: -1 };

function indiceDe_(cols, padroes) {
  for (var p = 0; p < padroes.length; p++) {
    for (var i = 0; i < cols.length; i++) {
      if (padroes[p].test(cols[i])) return i;
    }
  }
  return -1;
}

/**
 * Dados para preencher o formulário: colunas da folha Viagens,
 * listas de escolha (viaturas, motoristas, clientes) e o próximo código VF.
 */
function obterConfiguracao() {
  verificarAcesso_();
  var shV = folha_(PLANO_ID, FOLHA_VIAGENS);
  var cab = cabecalho_(shV);
  var ultima = shV.getLastRow();
  var dados = ultima > cab.linha
    ? shV.getRange(cab.linha + 1, 1, ultima - cab.linha, cab.cols.length).getValues()
    : [];

  var iVF   = indiceDe_(cab.cols, [/^vf$/i, /c[óo]digo/i]);
  var iMot  = indiceDe_(cab.cols, [/motorista|condutor/i]);
  var iVia  = indiceDe_(cab.cols, [/^matr[íi]cula/i, /^viatura/i, /viatura|matr[íi]cula/i]);
  var iCli  = indiceDe_(cab.cols, [/cliente/i]);

  /* próximo número VF */
  var maxVF = 0;
  if (iVF >= 0) {
    dados.forEach(function (r) {
      var m = String(r[iVF]).trim().match(/(\d+)\s*$/);
      if (m) maxVF = Math.max(maxVF, parseInt(m[1], 10));
    });
  }

  /* listas de escolha: viaturas da folha própria, resto do histórico */
  var viaturas = [];
  try {
    var shVt = folha_(PLANO_ID, FOLHA_VIATURAS);
    var cabVt = cabecalho_(shVt);
    var iMat = indiceDe_(cabVt.cols, [/matr[íi]cula/i, /viatura/i]);
    if (iMat < 0) iMat = 0;
    if (shVt.getLastRow() > cabVt.linha) {
      shVt.getRange(cabVt.linha + 1, iMat + 1, shVt.getLastRow() - cabVt.linha, 1)
        .getValues().forEach(function (r) {
          var v = String(r[0]).trim();
          if (v && viaturas.indexOf(v) === -1) viaturas.push(v);
        });
    }
  } catch (e) { /* folha Viaturas ainda não existe */ }

  function distintos(idx) {
    var out = [];
    if (idx < 0) return out;
    dados.forEach(function (r) {
      var v = String(r[idx]).trim();
      if (v && out.indexOf(v) === -1) out.push(v);
    });
    return out.sort();
  }

  /* o valor combinado aparece no formulário mesmo antes de a coluna existir:
     é criada na primeira viagem que o tiver */
  var colunas = cab.cols.filter(function (c) { return c; });
  if (indiceDe_(colunas, [RE_COMBINADO]) < 0) colunas.push(COL_COMBINADO);

  return {
    colunas: colunas,
    colunaCombinado: colunas[indiceDe_(colunas, [RE_COMBINADO])],
    proximoVF: maxVF + 1,
    listas: {
      viatura: viaturas.length ? viaturas : distintos(iVia),
      motorista: distintos(iMot),
      cliente: distintos(iCli)
    }
  };
}

/**
 * Grava uma viagem nova na folha Viagens.
 * `valores` é um objeto { "Nome da coluna": valor }.
 */
function guardarViagem(valores, saida) {
  verificarAcesso_();
  saida = lerSaida_(saida);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);                    // evita duas gravações em simultâneo
  try {
    var sh = folha_(PLANO_ID, FOLHA_VIAGENS);
    var cab = cabecalho_(sh);
    /* valor combinado preenchido e a coluna ainda não existe: cria-a no fim */
    if (num_(valores[COL_COMBINADO]) && indiceDe_(cab.cols, [RE_COMBINADO]) < 0) {
      cab = garantirColuna_(sh, COL_COMBINADO, [RE_COMBINADO]).cab;
    }
    /* km e litros à saída: nas colunas da viagem (criadas no fim se faltarem) */
    if (saida.km != null || saida.litros != null) {
      [['kmSaida', saida.km], ['litrosSaida', saida.litros]].forEach(function (p) {
        if (p[1] == null) return;
        var c = CAMPOS_KM[p[0]];
        cab = garantirColuna_(sh, c.nome, [c.re]).cab;
        valores[cab.cols[indiceDe_(cab.cols, [c.re])]] = p[1];
      });
    }
    var iVF = indiceDe_(cab.cols, [/^vf$/i, /c[óo]digo/i]);

    /* recalcula o código no momento da gravação (o ecrã pode estar desatualizado) */
    var codigo = String(valores[cab.cols[iVF]] || '').trim();
    if (iVF >= 0 && !codigo) {
      codigo = String(obterConfiguracao().proximoVF);
      valores[cab.cols[iVF]] = codigo;
    }

    var linha = cab.cols.map(function (nome) {
      var v = valores[nome];
      return v === undefined || v === null ? '' : v;
    });
    sh.appendRow(linha);

    /* cria a folha da viagem na planilha de abastecimentos */
    var nomeFolha = 'VF' + String(codigo).replace(/\D/g, '');
    criarFolhaAbastecimentos_(nomeFolha, saida);
    if (saida.km != null || saida.litros != null) {
      escreverBlocoKm_(nomeFolha, { kmSaida: saida.km, litrosSaida: saida.litros });
    }

    return { ok: true, codigo: nomeFolha };
  } finally {
    lock.releaseLock();
  }
}

/** Cria (se faltar) a folha de abastecimentos da viagem, com cabeçalhos. */
var COLUNAS_ABAST = ['Data', 'Bomba', 'Local', 'Litros', 'Preço/Litro', 'Valor (MZN)', 'Km'];

/** Matrícula, motorista e trajecto de uma viagem, lidos da folha Viagens. */
function dadosDaViagem_(codigo) {
  var numero = String(codigo).replace(/\D/g, '');
  var out = { matricula: '', motorista: '', trajecto: '' };
  try {
    var sh = folha_(PLANO_ID, FOLHA_VIAGENS);
    var cab = cabecalho_(sh);
    if (sh.getLastRow() <= cab.linha) return out;
    var iVF = indiceDe_(cab.cols, [/^vf$/i, /c[óo]digo/i]);
    /* ancorados no início: "Tipo Viatura" não é a matrícula, e a Província
       aparece escrita com acento grave ("Provìncia") em folhas reais */
    var iMat = indiceDe_(cab.cols, [/^matr[íi]cula/i, /^viatura/i, /^ve[íi]culo/i,
                                    /matr[íi]cula|viatura/i]);
    var iMot = indiceDe_(cab.cols, [/^motorista/i, /motorista|condutor/i]);
    var iTra = indiceDe_(cab.cols, [/^(trajec?to|rota|percurso|itiner)/i, /^destino/i,
                                    /prov[íìi]ncia/i]);
    var iPro = indiceDe_(cab.cols, [/^prov[íìi]ncia/i]);
    var dados = sh.getRange(cab.linha + 1, 1, sh.getLastRow() - cab.linha, cab.cols.length).getValues();
    for (var i = dados.length - 1; i >= 0; i--) {      // a mais recente, se houver repetidos
      if (iVF < 0) break;
      if (String(dados[i][iVF]).replace(/\D/g, '') !== numero) continue;
      if (iMat >= 0) out.matricula = String(dados[i][iMat]).trim();
      if (iMot >= 0) out.motorista = String(dados[i][iMot]).trim();
      if (iTra >= 0) out.trajecto = String(dados[i][iTra]).trim();
      /* destino + província dão o trajecto completo (ex.: "Maxixe, Inhambane") */
      if (iPro >= 0 && iPro !== iTra) {
        var pr = String(dados[i][iPro]).trim();
        if (pr && pr !== out.trajecto) {
          out.trajecto = out.trajecto ? out.trajecto + ', ' + pr : pr;
        }
      }
      break;
    }
  } catch (e) { /* folha Viagens em falta: fica sem cabeçalho de viagem */ }
  return out;
}

/** Cria (se faltar) a folha de abastecimentos da viagem. */
function criarFolhaAbastecimentos_(nomeFolha) {
  var ss = SpreadsheetApp.openById(ABAST_ID);
  if (ss.getSheetByName(nomeFolha)) return;
  var sh = ss.insertSheet(nomeFolha);

  /* identificação da viagem e, por baixo, km e litros à saída e à chegada
     (os de chegada ficam vazios até se fechar a viagem). Pares rótulo/valor,
     para não se confundirem com o cabeçalho da tabela. */
  var v = dadosDaViagem_(nomeFolha);
  var bloco = [
    ['Viagem', nomeFolha],
    ['Matrícula', v.matricula],
    ['Motorista', v.motorista],
    ['Trajecto', v.trajecto]
  ].concat(ORDEM_KM.map(function (k) { return [CAMPOS_KM[k].nome, '']; }));
  sh.getRange(1, 1, bloco.length, 2).setValues(bloco);
  sh.getRange(1, 1, bloco.length, 1).setFontWeight('bold');

  var linhaCab = bloco.length + 3;            // duas linhas em branco antes da tabela
  sh.getRange(linhaCab, 1, 1, COLUNAS_ABAST.length).setValues([COLUNAS_ABAST]);
  sh.getRange(linhaCab, 1, 1, COLUNAS_ABAST.length).setFontWeight('bold');
  sh.setFrozenRows(linhaCab);
}

/* ---------- Km e litros à saída e à chegada · consumo da viagem ----------
   Na folha de abastecimentos ficam no bloco do topo (rótulo na coluna A,
   valor na B); na folha Viagens, em colunas próprias (criadas no fim se
   faltarem). Consumo = (litros saída + abastecidos − litros chegada) ÷
   (km chegada − km saída). */
var CAMPOS_KM = {
  kmSaida:       { nome: 'Km Saída',       re: /^km\s*(de\s*)?sa[íi]da/i },
  kmChegada:     { nome: 'Km Chegada',     re: /^km\s*(de\s*)?chegada/i },
  litrosSaida:   { nome: 'Litros Saída',   re: /^litros\s*(de\s*)?sa[íi]da/i },
  litrosChegada: { nome: 'Litros Chegada', re: /^litros\s*(de\s*)?chegada/i }
};
var ORDEM_KM = ['kmSaida', 'kmChegada', 'litrosSaida', 'litrosChegada'];
var COL_LITROS_CONSUMIDOS = { nome: 'Litros Consumidos', re: /^litros\s*consumid/i };
var COL_CONSUMO = { nome: 'Consumo (L/km)', re: /^consumo/i };

/** número ou null (vazio) — aceita vírgula decimal */
function numOuNada_(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  var n = num_(v);
  return isNaN(n) ? null : n;
}
function lerSaida_(saida) {
  saida = saida || {};
  var out = { km: numOuNada_(saida.km), litros: numOuNada_(saida.litros) };
  if (out.km != null && out.km < 0) throw new Error('Km à saída inválidos.');
  if (out.litros != null && out.litros < 0) throw new Error('Litros à saída inválidos.');
  return out;
}

/** Linhas do bloco km/litros numa folha de abastecimentos: { kmSaida: 5, … } */
function blocoKm_(sh) {
  var cab = cabecalhoAbast_(sh);
  var fim = cab.cols.length ? cab.linha - 1 : Math.min(sh.getLastRow(), 12);
  var out = { cab: cab, linhas: {}, valores: {}, ultimaTexto: 0 };
  if (fim < 1) return out;
  sh.getRange(1, 1, fim, 2).getValues().forEach(function (r, i) {
    var rot = String(r[0]).trim();
    if (rot) out.ultimaTexto = i + 1;
    ORDEM_KM.forEach(function (k) {
      if (!out.linhas[k] && CAMPOS_KM[k].re.test(semAcentos_(rot))) {
        out.linhas[k] = i + 1;
        out.valores[k] = numOuNada_(r[1]);
      }
    });
  });
  return out;
}

/** Escreve valores no bloco km/litros, acrescentando as linhas que faltem
    (folhas antigas) por baixo da identificação da viagem. */
function escreverBlocoKm_(nomeFolha, valores) {
  var sh = folha_(ABAST_ID, nomeFolha);
  var b = blocoKm_(sh);
  var falta = ORDEM_KM.filter(function (k) { return !b.linhas[k]; });
  if (falta.length) {
    if (!b.cab.cols.length) throw new Error('A folha ' + nomeFolha + ' não tem cabeçalho de tabela.');
    var pos = b.ultimaTexto;
    if (pos > 0) sh.insertRowsAfter(pos, falta.length);
    else sh.insertRowsBefore(1, falta.length + 1);
    var inicio = pos > 0 ? pos + 1 : 1;
    sh.getRange(inicio, 1, falta.length, 2).setValues(falta.map(function (k) { return [CAMPOS_KM[k].nome, '']; }));
    sh.getRange(inicio, 1, falta.length, 1).setFontWeight('bold');
    b = blocoKm_(sh);
  }
  ORDEM_KM.forEach(function (k) {
    if (valores[k] !== undefined && valores[k] !== null) sh.getRange(b.linhas[k], 2).setValue(valores[k]);
  });
}

/** Litros abastecidos e última leitura do conta-km, da folha da viagem. */
function abastecidosDaFolha_(sh) {
  var cab = cabecalhoAbast_(sh);
  var out = { litros: 0, n: 0, ultimoKm: null };
  if (!cab.cols.length || sh.getLastRow() <= cab.linha) return out;
  var iL = indiceDe_(cab.cols, [/^litros?$/i, /^litros?\b(?!.*(sa[íi]da|chegada|consum))/i]);
  var iK = indiceDe_(cab.cols, [/^km/i, /conta|od[óo]metro|quil[óo]metr/i]);
  sh.getRange(cab.linha + 1, 1, sh.getLastRow() - cab.linha, cab.cols.length).getValues().forEach(function (r) {
    var l = iL >= 0 ? num_(r[iL]) : 0;
    if (l > 0) { out.litros += l; out.n++; }
    var k = iK >= 0 ? num_(r[iK]) : 0;
    if (k > 0 && (out.ultimoKm == null || k > out.ultimoKm)) out.ultimoKm = k;
  });
  out.litros = Math.round(out.litros * 100) / 100;
  return out;
}

/** Linha da viagem na folha Viagens (0 se não existir). */
function linhaDaViagem_(sh, cab, vf) {
  var iVF = indiceDe_(cab.cols, [/^vf$/i, /c[óo]digo/i]);
  if (iVF < 0 || sh.getLastRow() <= cab.linha) return 0;
  var vals = sh.getRange(cab.linha + 1, iVF + 1, sh.getLastRow() - cab.linha, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]).replace(/\D/g, '') === vf) return cab.linha + 1 + i;
  }
  return 0;
}

/** Estado de uma viagem para o fecho: saída, chegada, litros abastecidos. */
function obterFechoViagem(codigo) {
  verificarAcesso_();
  var vf = String(codigo || '').replace(/\D/g, '');
  if (!vf) return null;
  var out = { vf: vf, kmSaida: null, kmChegada: null, litrosSaida: null, litrosChegada: null,
              regresso: '', litrosAbastecidos: 0, nAbast: 0, ultimoKm: null, temFolha: false };
  var d = dadosDaViagem_('VF' + vf);
  out.motorista = d.motorista; out.matricula = d.matricula; out.trajecto = d.trajecto;

  /* folha Viagens */
  var sv = folha_(PLANO_ID, FOLHA_VIAGENS), cv = cabecalho_(sv);
  var lv = linhaDaViagem_(sv, cv, vf);
  if (lv) {
    var row = sv.getRange(lv, 1, 1, cv.cols.length).getValues()[0];
    ORDEM_KM.forEach(function (k) {
      var i = indiceDe_(cv.cols, [CAMPOS_KM[k].re]);
      if (i >= 0) out[k] = numOuNada_(row[i]);
    });
    var iR = indiceDe_(cv.cols, [/^regresso/i, /^chegada$/i]);
    if (iR >= 0 && row[iR]) {
      var r = row[iR];
      out.regresso = r instanceof Date ? Utilities.formatDate(r, 'Africa/Maputo', 'dd/MM/yyyy') : String(r);
    }
  }
  /* folha de abastecimentos: o bloco do topo prevalece (é onde se escreve à mão) */
  var sa = null;
  try { sa = folha_(ABAST_ID, 'VF' + vf); } catch (e) { sa = null; }
  if (sa) {
    out.temFolha = true;
    var b = blocoKm_(sa);
    ORDEM_KM.forEach(function (k) { if (b.valores[k] != null) out[k] = b.valores[k]; });
    var a = abastecidosDaFolha_(sa);
    out.litrosAbastecidos = a.litros; out.nAbast = a.n; out.ultimoKm = a.ultimoKm;
  }
  out.fechada = out.kmChegada != null && out.litrosChegada != null;
  return out;
}

/**
 * Fecha a viagem: km e litros à chegada (e os de saída, se faltarem) na
 * folha de abastecimentos e na folha Viagens, com a data de regresso, os
 * litros consumidos e o consumo em L/km.
 * `dados`: { viagem, data, kmSaida, litrosSaida, kmChegada, litrosChegada }
 */
function fecharViagem(dados) {
  verificarAcesso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var vf = String(dados.viagem || '').replace(/\D/g, '');
    if (!vf) throw new Error('Escolhe a viagem.');
    var atual = obterFechoViagem(vf);
    if (!atual.temFolha) throw new Error('Não existe a folha VF' + vf + ' na planilha de abastecimentos.');
    var kmS = numOuNada_(dados.kmSaida);   if (kmS == null) kmS = atual.kmSaida;
    var lS  = numOuNada_(dados.litrosSaida); if (lS == null) lS = atual.litrosSaida;
    var kmC = numOuNada_(dados.kmChegada), lC = numOuNada_(dados.litrosChegada);
    if (kmS == null) throw new Error('Faltam os km à saída.');
    if (lS == null) throw new Error('Faltam os litros à saída.');
    if (kmC == null) throw new Error('Indica os km à chegada.');
    if (lC == null) throw new Error('Indica os litros à chegada.');
    if (kmC <= kmS) throw new Error('Os km à chegada (' + kmC + ') têm de ser mais do que os da saída (' + kmS + ').');
    if (lC < 0 || lS < 0) throw new Error('Litros inválidos.');
    var km = Math.round((kmC - kmS) * 100) / 100;
    var consumidos = Math.round((lS + atual.litrosAbastecidos - lC) * 100) / 100;
    if (!(consumidos > 0)) {
      throw new Error('Os litros não batem certo: ' + lS + ' à saída + ' + atual.litrosAbastecidos +
        ' abastecidos − ' + lC + ' à chegada = ' + consumidos + '. Confirma os valores.');
    }
    var lkm = Math.round(consumidos / km * 1000) / 1000;

    /* 1. folha de abastecimentos */
    escreverBlocoKm_('VF' + vf, { kmSaida: kmS, kmChegada: kmC, litrosSaida: lS, litrosChegada: lC });

    /* 2. folha Viagens */
    var avisos = [];
    var sv = folha_(PLANO_ID, FOLHA_VIAGENS);
    var cv = cabecalho_(sv);
    if (!linhaDaViagem_(sv, cv, vf)) throw new Error('A viagem VF' + vf + ' não está na folha Viagens.');
    var escrever = function (col, valor) {
      cv = garantirColuna_(sv, col.nome, [col.re]).cab;
      var lv = linhaDaViagem_(sv, cv, vf);
      var cel = sv.getRange(lv, indiceDe_(cv.cols, [col.re]) + 1);
      if (cel.getFormula && cel.getFormula()) return;      // não estragar fórmulas
      cel.setValue(valor);
    };
    escrever(CAMPOS_KM.kmSaida, kmS);
    escrever(CAMPOS_KM.kmChegada, kmC);
    escrever(CAMPOS_KM.litrosSaida, lS);
    escrever(CAMPOS_KM.litrosChegada, lC);
    escrever(COL_LITROS_CONSUMIDOS, consumidos);
    escrever(COL_CONSUMO, lkm);
    /* regresso e km da viagem: só se a coluna existir e a célula estiver vazia
       (o regresso pode ser corrigido no formulário: aí escreve-se) */
    var lv = linhaDaViagem_(sv, cv, vf);
    var iR = indiceDe_(cv.cols, [/^regresso/i, /^chegada$/i]);
    if (iR >= 0 && dados.data) {
      var cR = sv.getRange(lv, iR + 1);
      if (!(cR.getFormula && cR.getFormula())) cR.setValue(dados.data);
    }
    var iK = indiceDe_(cv.cols, [/^km$/i]);
    if (iK >= 0) {
      var cK = sv.getRange(lv, iK + 1);
      if (!String(cK.getValue()).trim() && !(cK.getFormula && cK.getFormula())) cK.setValue(km);
      else if (Math.abs(num_(cK.getValue()) - km) > 0.5) {
        avisos.push('a coluna KM tem ' + cK.getValue() + ' e o conta-quilómetros dá ' + km + ' — ficou como estava');
      }
    }
    if (atual.ultimoKm != null && kmC < atual.ultimoKm) {
      avisos.push('o último abastecimento foi aos ' + atual.ultimoKm + ' km, mais do que os km à chegada');
    }
    return { ok: true, vf: 'VF' + vf, km: km, litrosAbastecidos: atual.litrosAbastecidos,
             consumidos: consumidos, lPorKm: lkm, l100: Math.round(consumidos / km * 1000) / 10,
             aviso: avisos.length ? avisos.join(' · ') : null };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Acrescenta o bloco de título (Viagem / Matrícula / Motorista / Trajecto) às
 * folhas de abastecimentos que já existiam antes desta alteração.
 *
 * Correr à mão uma vez, a partir do editor do Apps Script: escolher
 * "preencherTitulosDasViagens" na lista de funções e clicar em Executar.
 * É seguro repetir — salta as folhas que já têm o bloco e nunca mexe nos
 * abastecimentos já lançados (as linhas são empurradas para baixo).
 */
function preencherTitulosDasViagens() {
  verificarAcesso_();
  var ss = SpreadsheetApp.openById(ABAST_ID);
  var feitas = [], saltadas = [];

  ss.getSheets().forEach(function (sh) {
    var nome = sh.getName();
    if (!/^vf\s*\d+$/i.test(nome.replace(/[\s\-_]/g, ''))) { saltadas.push(nome); return; }
    if (String(sh.getRange(1, 1).getValue()).trim().toLowerCase() === 'viagem') {
      saltadas.push(nome); return;      // já tem o bloco
    }
    var v = dadosDaViagem_(nome);
    sh.insertRowsBefore(1, 5);
    sh.getRange(1, 1, 4, 2).setValues([
      ['Viagem', nome],
      ['Matrícula', v.matricula],
      ['Motorista', v.motorista],
      ['Trajecto', v.trajecto]
    ]);
    sh.getRange(1, 1, 4, 1).setFontWeight('bold');
    feitas.push(nome);
  });

  var aviso = 'Bloco de título acrescentado em ' + feitas.length + ' folha(s)';
  if (feitas.length) aviso += ': ' + feitas.join(', ');
  aviso += '. Sem alterações em ' + saltadas.length + '.';
  Logger.log(aviso);
  return { ok: true, feitas: feitas, saltadas: saltadas, aviso: aviso };
}

/**
 * Grava um abastecimento na folha da viagem e, com ele, a despesa de
 * combustível no livro geral. Escreve por NOME de coluna, para que uma
 * folha antiga (sem a coluna "Bomba") continue a receber os valores nos
 * sítios certos em vez de ficar desalinhada.
 */
function guardarAbastecimento(codigo, dados) {
  verificarAcesso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    /* como foi pago — valida ANTES de escrever o que quer que seja:
       Caixa / Banco → despesa normal da empresa;
       Sócio         → despesa + conta do sócio (adiantamento ou investimento) */
    if (!/^(Caixa|Banco|Sócio|Motorista)$/.test(dados.meio || '')) {
      throw new Error('Indica como foi pago: Caixa, Banco, Sócio ou Motorista.');
    }
    var pago = pagamentoDoSocio_(dados);
    var nomeFolha = 'VF' + String(codigo).replace(/\D/g, '');
    criarFolhaAbastecimentos_(nomeFolha);
    var sh = folha_(ABAST_ID, nomeFolha);
    var cab = cabecalhoAbast_(sh);
    if (!cab.cols.length) {
      throw new Error('A folha ' + nomeFolha + ' não tem cabeçalho de tabela ' +
        '(Data, Litros, Preço/Litro…). Acrescenta-o e grava outra vez.');
    }

    var litros = num_(dados.litros);
    var preco = num_(dados.preco);
    /* aos cêntimos: 129,31 × 116 não pode ir para a folha como 14999,960000000001 */
    var total = Math.round((dados.valor ? num_(dados.valor) : (litros * preco)) * 100) / 100;
    var km = num_(dados.km);

    var linha = [];
    for (var i = 0; i < cab.cols.length; i++) linha.push('');
    function por(padroes, v) {
      var k = indiceDe_(cab.cols, padroes);
      if (k >= 0 && v !== '' && v != null) linha[k] = v;
    }
    /* padrões ancorados no início do nome: "litros" solto também casaria com
       "Preço/Litro", e os litros iriam para a coluna do preço */
    por([/^data/i], dados.data || '');
    por([/^bomba/i, /^posto/i], dados.bomba || '');
    por([/^local/i, /^cidade/i, /^localidade/i], dados.local || '');
    por([/^litros?\b/i, /^litros?$/i], litros || '');
    por([/^pre[çc]o/i], preco || '');
    por([/^valor/i, /^montante/i, /^total/i], total || '');
    por([/^km\b/i, /^conta[\s-]?km/i, /^od[óo]metro/i, /^quil[óo]metr/i], km || '');
    sh.appendRow(linha);

    /* O combustível é dinheiro que sai: entra também como despesa no livro
       geral, senão a tesouraria e as despesas ficavam por baixo do real.
       Não é preciso lançá-lo outra vez no formulário Contas. */
    var escritas = [nomeFolha], aviso = null;
    if (total) {
      var onde = [dados.bomba, dados.local].filter(function (x) { return x; }).join(' ');
      aviso = tentarEscreverGeral_({
        data: dados.data,
        tipo: 'Despesa',
        categoria: CATEGORIA_COMBUSTIVEL,
        descricao: 'Abastecimento' + (onde ? ' ' + onde : '') + ' · ' + nomeFolha,
        valor: total,
        meio: dados.meio,
        quem: pago ? pago.socio : (dados.bomba || dados.quem || ''),
        viagem: nomeFolha,
        nota: litros ? litros + ' L' + (preco ? ' a ' + preco + ' MZN/L' : '') : '',
        /* combustível de uma viagem: o motorista tem de entregar o recibo */
        recibo: dados.reciboEntregue ? RECIBO_ENTREGUE : RECIBO_PENDENTE
      });
      if (!aviso) escritas.push(FOLHA_GERAL);

      /* pago por um sócio: vai também para a conta dele */
      if (pago) {
        var avisoS = registarDespesaDoSocio_(pago.socio, {
          data: dados.data, categoria: CATEGORIA_COMBUSTIVEL, valor: total, viagem: nomeFolha,
          descricao: 'Abastecimento' + (onde ? ' ' + onde : '') + ' · ' + nomeFolha, fica: pago.fica
        });
        if (avisoS) aviso = (aviso ? aviso + ' · ' : '') + 'Conta de ' + pago.socio + ': ' + avisoS;
        else escritas.push(FOLHA_MOVS);
      }
    }
    /* pago pelo motorista, do adiantamento: atualiza a conta dele na viagem */
    if (dados.meio === MEIO_MOTORISTA) sincronizarContaMotorista_(nomeFolha);
    return { ok: true, folha: nomeFolha, total: total, folhas: escritas, aviso: aviso,
             fica: pago ? pago.fica : null, socio: pago ? pago.socio : null };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Dados para o formulário de Lançamento de Contas: sócios, categorias já
 * usadas (nos dois livros) e o que cada folha tem.
 */
function obterConfiguracaoMovimentos() {
  verificarAcesso_();

  /* nomes dos sócios, a partir da folha de contas correntes */
  var socios = [];
  try {
    var shS = folha_(PLANO_ID, FOLHA_SOCIOS);
    var cabS = cabecalho_(shS);
    var iNome = indiceDe_(cabS.cols, [/^s[óo]cio$/i, /s[óo]cio/i]);
    if (iNome < 0) iNome = 0;
    if (shS.getLastRow() > cabS.linha) {
      shS.getRange(cabS.linha + 1, iNome + 1, shS.getLastRow() - cabS.linha, 1)
        .getValues().forEach(function (r) {
          var v = String(r[0]).trim();
          if (v && !/^total/i.test(v) && socios.indexOf(v) === -1) socios.push(v);
        });
    }
  } catch (e) { /* folha de sócios ainda não existe */ }

  var categorias = [];
  function juntarCategorias(sh) {
    var cab = cabecalho_(sh);
    var iCat = indiceDe_(cab.cols, [/categoria/i]);
    if (iCat < 0 || sh.getLastRow() <= cab.linha) return;
    sh.getRange(cab.linha + 1, iCat + 1, sh.getLastRow() - cab.linha, 1)
      .getValues().forEach(function (r) {
        var v = String(r[0]).trim();
        if (v && categorias.indexOf(v) === -1) categorias.push(v);
      });
  }

  /* quem já apareceu em «Pago Por»: sócios, fornecedores, clientes.
     As linhas de combustível dão-nos também a lista das bombas. */
  var pagadores = [], bombas = [];
  function juntarPagadores(sh) {
    var cab = cabecalho_(sh);
    var iP = indiceDe_(cab.cols, [/pago\s*por|contraparte|fornecedor/i]);
    if (iP < 0 || sh.getLastRow() <= cab.linha) return;
    var iCat = indiceDe_(cab.cols, [/categoria/i]);
    var largura = iCat >= 0 ? Math.max(iP, iCat) + 1 : iP + 1;
    sh.getRange(cab.linha + 1, 1, sh.getLastRow() - cab.linha, largura)
      .getValues().forEach(function (r) {
        var v = String(r[iP]).trim();
        if (!v) return;
        if (pagadores.indexOf(v) === -1) pagadores.push(v);
        var cat = iCat >= 0 ? String(r[iCat]).trim().toLowerCase() : '';
        if (cat.indexOf('combust') === 0 && bombas.indexOf(v) === -1) bombas.push(v);
      });
  }

  var temGeral = true, colunasGeral = [];
  try {
    var shG = folha_(PLANO_ID, FOLHA_GERAL);
    colunasGeral = cabecalho_(shG).cols.filter(function (c) { return c; });
    juntarCategorias(shG);
    juntarPagadores(shG);
  } catch (e) { temGeral = false; }

  var socioCols = [];
  try {
    var shI = folhaEntre_(PLANO_ID, [FOLHA_MOVS, FOLHA_MOVS_ALT]);
    var cabI = cabecalho_(shI);
    socioCols = socios.filter(function (nome) {
      return cabI.cols.some(function (c) { return c.toLowerCase() === nome.toLowerCase(); });
    });
    juntarCategorias(shI);
  } catch (e) { /* livro dos investidores ainda não existe */ }

  CATEGORIAS_BASE.forEach(function (c) {
    if (!categorias.some(function (x) { return semAcentos_(x) === semAcentos_(c); })) categorias.push(c);
  });
  categorias.sort();
  /* na lista de escolha, os sócios primeiro; depois o resto do histórico */
  var outros = pagadores.filter(function (v) {
    return !socios.some(function (s) { return s.toLowerCase() === v.toLowerCase(); });
  }).sort();

  return {
    socios: socios,
    socioCols: socioCols,
    categorias: categorias,
    pagadores: outros,
    bombas: bombas.sort(),
    tipos: TIPOS,
    tiposInvestidores: TIPOS_INVESTIDORES,
    tiposCapital: TIPOS_CAPITAL,
    tiposAdiantamento: TIPOS_ADIANTAMENTO,
    adiantamentos: saldosAdiantamentos_(),
    pagadorEmpresa: PAGADOR_EMPRESA,
    temGeral: temGeral,
    colunasGeral: colunasGeral
  };
}

/**
 * Como escreverGeral_, mas nunca rebenta: devolve o erro em texto.
 * Usado depois de já se ter gravado noutra folha, para não deixar o
 * lançamento a meio quando a folha «Movimentos Geral» ainda não existe.
 */
function tentarEscreverGeral_(dados) {
  try { escreverGeral_(dados); return null; }
  catch (e) { return e.message || String(e); }
}

/**
 * Escreve uma linha no livro geral. Usado pelos dois formulários.
 * `dados`: { data, tipo, categoria, descricao, valor, meio, quem, viagem, nota }
 */
function escreverGeral_(dados) {
  var sh = folha_(PLANO_ID, FOLHA_GERAL);
  var cab = cabecalho_(sh);
  var linha = [];
  for (var i = 0; i < cab.cols.length; i++) linha.push('');
  function por(padroes, v) {
    var k = indiceDe_(cab.cols, padroes);
    if (k >= 0 && v !== '' && v != null) linha[k] = v;
  }
  por([/^data$/i], dados.data || '');
  por([/^tipo$/i], dados.tipo || '');
  por([/categoria/i], dados.categoria || '');
  por([/descri/i, /^item$/i], dados.descricao || '');
  por([/^valor/i, /montante/i], num_(dados.valor));
  por([/sentido|natureza|entrada/i], sentidoDe_(dados.tipo));
  por([/^meio/i, /forma\s*de\s*pagamento/i, /^conta$/i], dados.meio || '');
  por([/pago\s*por|respons|contraparte|fornecedor/i], dados.quem || '');
  por([/^(vf|viagem)$/i], dados.viagem ? String(dados.viagem).replace(/\D/g, '') : '');
  por([/nota|observ/i], dados.nota || '');
  if (dados.recibo) {
    var g = garantirColuna_(sh, COL_RECIBO, [/^recibo/i]);
    while (linha.length < g.cab.cols.length) linha.push('');
    linha[indiceDe_(g.cab.cols, [/^recibo/i])] = dados.recibo;
  }
  sh.appendRow(linha);
}

/** Estado do recibo de uma despesa (vazio quando não se aplica). */
function estadoRecibo_(dados) {
  if (dados.tipo !== 'Despesa' || !dados.viagem) return '';
  /* o que o motorista paga do adiantamento justifica-se com recibo — tudo menos as diárias */
  var doMotorista = dados.meio === MEIO_MOTORISTA && !/diari/.test(semAcentos_(dados.categoria));
  if (!doMotorista && !precisaRecibo_(dados.categoria)) return '';
  return dados.reciboEntregue ? RECIBO_ENTREGUE : RECIBO_PENDENTE;
}

/**
 * Despesa paga do bolso de um sócio: quem foi e como fica. Lança um erro
 * claro se faltar o sócio — antes de se escrever o que quer que seja.
 */
function pagamentoDoSocio_(dados) {
  if (dados.meio !== 'Sócio') return null;
  var socio = socioChamado_(dados.socio || dados.quem);
  if (!socio) throw new Error('Pago por um sócio: escolhe qual dos sócios pagou.');
  var fica = dados.fica === FICA_INVESTIMENTO ? FICA_INVESTIMENTO : FICA_ADIANTAMENTO;
  return { socio: socio, fica: fica };
}

/**
 * Formulário «Contas» — escreve APENAS no livro geral.
 * `dados`: { data, tipo, categoria, descricao, valor, meio, quem, viagem, nota }
 */
function guardarMovimento(dados) {
  verificarAcesso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!num_(dados.valor)) throw new Error('Indica um valor.');
    if (!String(dados.quem || '').trim()) throw new Error('Indica quem pagou ou recebeu.');

    /* despesa paga do bolso de um sócio: vai também para a conta dele,
       como adiantamento (a empresa devolve) ou como investimento (capital) */
    var pago = dados.tipo === 'Despesa' ? pagamentoDoSocio_(dados) : null;
    if (pago) dados.quem = dados.quem || pago.socio;
    dados.recibo = estadoRecibo_(dados);
    escreverGeral_(dados);
    var folhas = [FOLHA_GERAL], aviso = null;
    if (pago) {
      aviso = registarDespesaDoSocio_(pago.socio, {
        data: dados.data, categoria: dados.categoria, descricao: dados.descricao,
        valor: dados.valor, viagem: dados.viagem, fica: pago.fica });
      if (!aviso) folhas.push(FOLHA_MOVS);
      else aviso = 'Entrou no livro geral, mas não na conta de ' + pago.socio + ': ' + aviso;
    }
    return { ok: true, folhas: folhas, aviso: aviso, fica: pago ? pago.fica : null };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Formulário «Investimentos» — escreve nos DOIS livros.
 * O valor de cada sócio vai para a coluna dele no livro dos investidores;
 * a soma desses valores é o valor da linha no livro geral.
 *
 * `dados`: { data, tipo, categoria, descricao, viagem, nota,
 *            valores: { "Tommy": 1000, "Nuno": 500, ... } }
 */
function guardarInvestimento(dados) {
  verificarAcesso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var valores = dados.valores || {};
    var shI = folhaEntre_(PLANO_ID, [FOLHA_MOVS, FOLHA_MOVS_ALT]);
    var classe = classeAdiant_(dados.tipo);

    /* adiantamentos e devoluções passam pela caixa ou pelo banco da empresa */
    var meio = 'Sócio';
    if (classe || /devolu|dividend/i.test(semAcentos_(dados.tipo))) {
      meio = dados.meio || '';
      if (!/^(caixa|banco)$/i.test(meio)) {
        throw new Error('Indica por onde passou o dinheiro na empresa: Caixa ou Banco.');
      }
    }

    /* sem coluna Tipo, um adiantamento ficaria igual a um investimento */
    var colunaCriada = false;
    var cabI;
    if (dados.tipo && dados.tipo !== 'Investimento') {
      var g = garantirColunaTipo_(shI);
      cabI = g.cab; colunaCriada = g.criada;
    } else {
      cabI = cabecalho_(shI);
    }
    var saldosAntes = classe ? saldosAdiantamentos_() : {};

    /* casa cada sócio com a coluna dele e soma o total */
    var total = 0, contribuintes = [], colunas = {};
    for (var nome in valores) {
      var v = num_(valores[nome]);
      if (!v) continue;
      var idx = colunaDoSocio_(cabI.cols, nome);
      if (idx < 0) {
        throw new Error('«' + nome + '» não tem coluna na folha ' + shI.getName() +
          ' — acrescenta-a antes de lançar.');
      }
      colunas[idx] = v;
      contribuintes.push(nome);
      total += v;
    }
    if (!total) throw new Error('Preenche o valor de pelo menos um sócio.');

    /* uma devolução maior do que o pendente quase sempre é engano: avisa */
    var avisos = [];
    if (classe === 'devAo' || classe === 'devDo') {
      contribuintes.forEach(function (nome) {
        var pend = saldosAntes[nome] || 0;
        var deve = classe === 'devAo' ? Math.max(0, pend) : Math.max(0, -pend);
        var v = num_(valores[nome]);
        if (v > deve + 0.5) {
          avisos.push(nome + ' tinha ' + deve.toLocaleString('pt-PT') + ' MZN pendentes neste sentido e a devolução foi de ' +
            v.toLocaleString('pt-PT') + ' — o excedente fica como adiantamento no sentido contrário.');
        }
      });
    }

    /* 1) livro dos investidores: uma linha, o valor de cada sócio na sua coluna */
    var linhaI = [];
    for (var i = 0; i < cabI.cols.length; i++) linhaI.push('');
    function porI(padroes, v) {
      var k = indiceDe_(cabI.cols, padroes);
      if (k >= 0 && v !== '' && v != null) linhaI[k] = v;
    }
    porI([/^data$/i], dados.data || '');
    /* Item = o "quê" (categoria), Descrição = o detalhe — como na folha atual */
    porI([/^item$/i], dados.categoria || dados.tipo || dados.descricao || '');
    porI([/descri/i, /nota/i], dados.descricao || '');
    porI([/^tipo$/i], dados.tipo || '');
    porI([/categoria/i], dados.categoria || '');
    porI([/^(vf|viagem)$/i], dados.viagem ? String(dados.viagem).replace(/\D/g, '') : '');
    for (var col in colunas) linhaI[Number(col)] = colunas[col];
    shI.appendRow(linhaI);

    /* 2) livro geral: uma linha com o SOMATÓRIO */
    var avisoInv = tentarEscreverGeral_({
      data: dados.data,
      tipo: dados.tipo,
      categoria: dados.categoria,
      descricao: dados.descricao,
      valor: total,
      meio: meio,
      quem: contribuintes.join(', '),
      viagem: dados.viagem,
      nota: dados.nota
    });

    var folhasInv = [shI.getName()];
    if (!avisoInv) folhasInv.push(FOLHA_GERAL);
    return { ok: true, total: total, folhas: folhasInv, aviso: avisoInv,
             avisos: avisos, colunaTipoCriada: colunaCriada };
  } finally {
    lock.releaseLock();
  }
}

/** Entrada (dinheiro que chega) ou saída, a partir do tipo. */
function sentidoDe_(tipo) {
  var cm = classeMotorista_(tipo);
  if (cm) return cm === 'dev' ? 'Entrada' : 'Saída';
  var cl = classeAdiant_(tipo);
  if (cl) return SINAL_ADIANT[cl] > 0 ? 'Entrada' : 'Saída';
  var t = String(tipo || '').toLowerCase();
  return (t.indexOf('supriment') === 0 || t.indexOf('recebiment') === 0) ? 'Entrada' : 'Saída';
}

/* ------------------------------------------------------------------
   Livro dos investidores: coluna Tipo, saldos e despesas pagas por sócios
   ------------------------------------------------------------------ */

/**
 * Garante que o livro dos investidores tem a coluna «Tipo». Sem ela, um
 * adiantamento ficaria igual a um investimento e entrava nas quotas.
 * A coluna é acrescentada no FIM do cabeçalho, para não deslocar fórmulas.
 * As linhas antigas, sem tipo, continuam a contar como Investimento.
 */
function garantirColunaTipo_(sh) { return garantirColuna_(sh, 'Tipo', [/^tipo$/i]); }

/**
 * Garante que a folha tem a coluna `nome` (procurada pelos `padroes`).
 * Se faltar, é acrescentada no FIM do cabeçalho — nunca no meio, para não
 * deslocar fórmulas. Devolve o cabeçalho atualizado.
 */
function garantirColuna_(sh, nome, padroes) {
  var cab = cabecalho_(sh);
  if (indiceDe_(cab.cols, padroes) >= 0) return { cab: cab, criada: false };
  var ultima = 0;
  for (var i = 0; i < cab.cols.length; i++) if (cab.cols[i]) ultima = i + 1;
  sh.getRange(cab.linha, ultima + 1).setValue(nome);
  return { cab: cabecalho_(sh), criada: true };
}

/** Coluna de um sócio no livro dos investidores (-1 se não tiver). */
function colunaDoSocio_(cols, nome) {
  var n = semAcentos_(nome);
  for (var j = 0; j < cols.length; j++) if (semAcentos_(cols[j]) === n) return j;
  return -1;
}

/** Nome do sócio, tal como está na folha de sócios, ou null. */
function socioChamado_(nome) {
  var n = semAcentos_(nome);
  if (!n) return null;
  var socios = obterConfiguracaoMovimentos_socios_();
  for (var i = 0; i < socios.length; i++) if (semAcentos_(socios[i]) === n) return socios[i];
  return null;
}

function obterConfiguracaoMovimentos_socios_() {
  var socios = [];
  try {
    var shS = folha_(PLANO_ID, FOLHA_SOCIOS);
    var cabS = cabecalho_(shS);
    var iNome = indiceDe_(cabS.cols, [/^s[óo]cio$/i, /s[óo]cio/i]);
    if (iNome < 0) iNome = 0;
    if (shS.getLastRow() > cabS.linha) {
      shS.getRange(cabS.linha + 1, iNome + 1, shS.getLastRow() - cabS.linha, 1)
        .getValues().forEach(function (r) {
          var v = String(r[0]).trim();
          if (v && !/^total/i.test(v) && socios.indexOf(v) === -1) socios.push(v);
        });
    }
  } catch (e) { /* folha de sócios ainda não existe */ }
  return socios;
}

/**
 * Saldo de adiantamentos de cada sócio, a partir do livro dos investidores.
 * Positivo = a empresa deve-lhe; negativo = ele deve à empresa.
 */
function saldosAdiantamentos_() {
  var saldos = {};
  try {
    var sh = folhaEntre_(PLANO_ID, [FOLHA_MOVS, FOLHA_MOVS_ALT]);
    var cab = cabecalho_(sh);
    var iTipo = indiceDe_(cab.cols, [/^tipo$/i]);
    if (iTipo < 0 || sh.getLastRow() <= cab.linha) return saldos;
    var socios = obterConfiguracaoMovimentos_socios_();
    var cols = socios.map(function (n) { return { nome: n, i: colunaDoSocio_(cab.cols, n) }; })
      .filter(function (c) { return c.i >= 0; });
    var dados = sh.getRange(cab.linha + 1, 1, sh.getLastRow() - cab.linha, cab.cols.length).getValues();
    dados.forEach(function (r) {
      var cl = classeAdiant_(r[iTipo]);
      if (!cl) return;
      cols.forEach(function (c) {
        var v = num_(r[c.i]);
        if (v) saldos[c.nome] = (saldos[c.nome] || 0) + SINAL_ADIANT[cl] * v;
      });
    });
  } catch (e) { /* livro ainda não existe */ }
  return saldos;
}

/**
 * Regista no livro dos investidores uma despesa da empresa paga do bolso de
 * um sócio. Conta a favor dele nos adiantamentos: abate ao que ele tinha
 * levado da empresa, ou passa a ser dinheiro que a empresa lhe deve.
 * Nunca rebenta — devolve o erro em texto (o livro geral já foi escrito).
 */
function registarDespesaDoSocio_(socio, d) {
  try {
    var tipo = d.fica === FICA_INVESTIMENTO ? 'Investimento' : (d.tipoAdiantamento || TIPO_DESPESA_SOCIO);
    var sh = folhaEntre_(PLANO_ID, [FOLHA_MOVS, FOLHA_MOVS_ALT]);
    /* a coluna Tipo só é obrigatória quando não é investimento: uma linha sem
       tipo neste livro sempre contou como investimento */
    var cab = tipo === 'Investimento' ? cabecalho_(sh) : garantirColunaTipo_(sh).cab;
    var col = colunaDoSocio_(cab.cols, socio);
    if (col < 0) return '«' + socio + '» não tem coluna na folha ' + sh.getName() + '.';
    var linha = [];
    for (var i = 0; i < cab.cols.length; i++) linha.push('');
    function por(padroes, v) {
      var k = indiceDe_(cab.cols, padroes);
      if (k >= 0 && v !== '' && v != null) linha[k] = v;
    }
    por([/^data$/i], d.data || '');
    por([/^item$/i], d.categoria || TIPO_DESPESA_SOCIO);
    por([/descri/i, /nota/i], d.descricao || '');
    por([/^tipo$/i], tipo);
    por([/categoria/i], d.categoria || '');
    por([/^(vf|viagem)$/i], d.viagem ? String(d.viagem).replace(/\D/g, '') : '');
    linha[col] = Math.round(num_(d.valor) * 100) / 100;
    sh.appendRow(linha);
    return null;
  } catch (e) { return e.message || String(e); }
}

/**
 * Por viagem: valor combinado e quanto já se recebeu (recebimentos do livro
 * geral com o mesmo VF). Usado pelo formulário para mostrar o pendente.
 * Devolve { "2": { combinado: 50000, recebido: 20000 }, ... }
 */
function resumoViagens() {
  verificarAcesso_();
  var out = {};
  var sh = folha_(PLANO_ID, FOLHA_VIAGENS);
  var cab = cabecalho_(sh);
  var iVF = indiceDe_(cab.cols, [/^vf$/i, /c[óo]digo/i]);
  var iC = indiceDe_(cab.cols, [RE_COMBINADO]);
  if (iVF >= 0 && sh.getLastRow() > cab.linha) {
    sh.getRange(cab.linha + 1, 1, sh.getLastRow() - cab.linha, cab.cols.length).getValues()
      .forEach(function (r) {
        var n = String(r[iVF]).replace(/\D/g, '');
        if (n) out[n] = { combinado: iC >= 0 ? num_(r[iC]) : 0, recebido: 0 };
      });
  }
  try {
    var shG = folha_(PLANO_ID, FOLHA_GERAL);
    var cg = cabecalho_(shG);
    var iT = indiceDe_(cg.cols, [/^tipo$/i]), iV = indiceDe_(cg.cols, [/^(vf|viagem)$/i]);
    var iVal = indiceDe_(cg.cols, [/^valor/i, /montante/i]);
    if (iT >= 0 && iV >= 0 && iVal >= 0 && shG.getLastRow() > cg.linha) {
      shG.getRange(cg.linha + 1, 1, shG.getLastRow() - cg.linha, cg.cols.length).getValues()
        .forEach(function (r) {
          if (!/^receb/i.test(String(r[iT]).trim())) return;
          var n = String(r[iV]).replace(/\D/g, '');
          if (!n) return;
          if (!out[n]) out[n] = { combinado: 0, recebido: 0 };
          out[n].recebido += num_(r[iVal]);
        });
    }
  } catch (e) { /* livro geral ainda não existe */ }
  return out;
}

/** Despesas de viagens com o recibo por entregar (separador Recibos). */
function listarRecibosPendentes() {
  verificarAcesso_();
  var sh = folha_(PLANO_ID, FOLHA_GERAL);
  var cab = cabecalho_(sh);
  var iR = indiceDe_(cab.cols, [/^recibo/i]);
  if (iR < 0 || sh.getLastRow() <= cab.linha) return [];
  var ix = {
    data: indiceDe_(cab.cols, [/^data$/i]), cat: indiceDe_(cab.cols, [/categoria/i]),
    desc: indiceDe_(cab.cols, [/descri/i]), val: indiceDe_(cab.cols, [/^valor/i, /montante/i]),
    vf: indiceDe_(cab.cols, [/^(vf|viagem)$/i])
  };
  var dados = sh.getRange(cab.linha + 1, 1, sh.getLastRow() - cab.linha, cab.cols.length).getValues();
  var out = [];
  dados.forEach(function (r, k) {
    if (String(r[iR]).trim() !== RECIBO_PENDENTE) return;
    var d = r[ix.data];
    out.push({
      linha: cab.linha + 1 + k,
      data: d instanceof Date ? Utilities.formatDate(d, 'Africa/Maputo', 'dd/MM/yyyy') : String(d),
      categoria: String(r[ix.cat] || ''), descricao: String(r[ix.desc] || ''),
      valor: num_(r[ix.val]), viagem: ix.vf >= 0 ? String(r[ix.vf]).replace(/\D/g, '') : ''
    });
  });
  return out;
}

/**
 * Marca o recibo de uma despesa como entregue. A linha é conferida (descrição
 * e valor) antes de mexer: se a folha tiver mudado entretanto, não toca em nada.
 */
function marcarReciboEntregue(linha, conferir) {
  verificarAcesso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = folha_(PLANO_ID, FOLHA_GERAL);
    var cab = cabecalho_(sh);
    var iR = indiceDe_(cab.cols, [/^recibo/i]);
    var iD = indiceDe_(cab.cols, [/descri/i]), iV = indiceDe_(cab.cols, [/^valor/i, /montante/i]);
    if (iR < 0 || linha <= cab.linha) throw new Error('Linha inválida.');
    var r = sh.getRange(linha, 1, 1, cab.cols.length).getValues()[0];
    if (String(r[iD] || '') !== String(conferir.descricao || '') ||
        Math.abs(num_(r[iV]) - num_(conferir.valor)) > 0.01 ||
        String(r[iR]).trim() !== RECIBO_PENDENTE) {
      throw new Error('Esta linha mudou na folha entretanto — recarrega a lista e tenta outra vez.');
    }
    sh.getRange(linha, iR + 1).setValue(RECIBO_ENTREGUE);
    var iVF = indiceDe_(cab.cols, [/^(vf|viagem)$/i]);
    if (iVF >= 0 && String(r[iVF]).replace(/\D/g, '')) {
      try { sincronizarContaMotorista_(r[iVF]); } catch (e) { /* a folha Viagens não impede o recibo */ }
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------
   Faturação
   ------------------------------------------------------------------ */

/** Folha Faturas; criada com o cabeçalho na primeira fatura. */
function folhaFaturas_(criar) {
  var ss = SpreadsheetApp.openById(PLANO_ID);
  var sh = ss.getSheetByName(FOLHA_FATURAS);
  if (sh || !criar) return sh;
  sh = ss.insertSheet(FOLHA_FATURAS);
  sh.appendRow(COLUNAS_FATURAS);
  sh.getRange(1, 1, 1, COLUNAS_FATURAS.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

/** Faturas já registadas: { numeros: [...], porVF: { "2": "FT 12/2026" } } */
function faturasRegistadas_() {
  var out = { numeros: [], porVF: {} };
  var sh = folhaFaturas_(false);
  if (!sh || sh.getLastRow() < 2) return out;
  var cab = cabecalho_(sh);
  var iN = indiceDe_(cab.cols, [/n[º°o]?\.?\s*(fatura|factura)|^(fatura|factura)/i]);
  var iV = indiceDe_(cab.cols, [/^(vf|viagem)$/i]);
  if (iN < 0 || sh.getLastRow() <= cab.linha) return out;
  sh.getRange(cab.linha + 1, 1, sh.getLastRow() - cab.linha, cab.cols.length).getValues()
    .forEach(function (r) {
      var n = String(r[iN]).trim();
      if (!n) return;
      out.numeros.push(n);
      var vf = iV >= 0 ? String(r[iV]).replace(/\D/g, '') : '';
      if (vf) out.porVF[vf] = n;
    });
  return out;
}

/**
 * Para o formulário Faturação: as viagens, com cliente, valor combinado e a
 * fatura que já tiverem (pela folha Faturas ou pela coluna Factura da viagem).
 */
function obterConfiguracaoFaturas() {
  verificarAcesso_();
  var reg = faturasRegistadas_();
  var sh = folha_(PLANO_ID, FOLHA_VIAGENS);
  var cab = cabecalho_(sh);
  var ix = {
    vf: indiceDe_(cab.cols, [/^vf$/i, /c[óo]digo/i]),
    cli: indiceDe_(cab.cols, [/^cliente/i, /cliente/i]),
    comb: indiceDe_(cab.cols, [RE_COMBINADO]),
    fat: indiceDe_(cab.cols, [/^(factura|fatura)/i]),
    data: indiceDe_(cab.cols, [/^partida$/i, /^data$/i])
  };
  var viagens = [];
  if (ix.vf >= 0 && sh.getLastRow() > cab.linha) {
    sh.getRange(cab.linha + 1, 1, sh.getLastRow() - cab.linha, cab.cols.length).getValues()
      .forEach(function (r) {
        var vf = String(r[ix.vf]).replace(/\D/g, '');
        if (!vf) return;
        var d = ix.data >= 0 ? r[ix.data] : '';
        viagens.push({
          vf: vf,
          cliente: ix.cli >= 0 ? String(r[ix.cli]).trim() : '',
          combinado: ix.comb >= 0 ? num_(r[ix.comb]) : 0,
          data: d instanceof Date ? Utilities.formatDate(d, 'Africa/Maputo', 'dd/MM/yyyy') : String(d || ''),
          fatura: reg.porVF[vf] || (ix.fat >= 0 ? String(r[ix.fat]).trim() : '')
        });
      });
  }
  return { viagens: viagens.reverse(), prazoDias: PRAZO_PAGAMENTO_DIAS, ultimas: reg.numeros.slice(-3) };
}

/**
 * Regista uma fatura (emitida noutro lado) de UMA viagem.
 * `dados`: { numero, data, vencimento, viagem, cliente, valor, nota }
 * Escreve na folha Faturas, põe o nº na coluna Factura da viagem e, se a
 * viagem ainda não tiver valor combinado, passa a ter o valor da fatura.
 */
function guardarFatura(dados) {
  verificarAcesso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var numero = String(dados.numero || '').trim();
    var vf = String(dados.viagem || '').replace(/\D/g, '');
    var valor = num_(dados.valor);
    if (!numero) throw new Error('Indica o número da fatura.');
    if (!vf) throw new Error('Escolhe a viagem.');
    if (!(valor > 0)) throw new Error('Indica o valor da fatura (sem IVA).');

    var reg = faturasRegistadas_();
    var norm = function (x) { return String(x).toLowerCase().replace(/\s+/g, ''); };
    if (reg.numeros.some(function (n) { return norm(n) === norm(numero); })) {
      throw new Error('A fatura ' + numero + ' já está registada.');
    }
    if (reg.porVF[vf]) throw new Error('A VF' + vf + ' já tem a fatura ' + reg.porVF[vf] + ' (uma viagem por fatura).');

    /* a viagem tem de existir; e não pode ter já outra fatura na coluna Factura */
    var shV = folha_(PLANO_ID, FOLHA_VIAGENS);
    var cabV = cabecalho_(shV);
    var iVF = indiceDe_(cabV.cols, [/^vf$/i, /c[óo]digo/i]);
    var linhaV = -1;
    if (iVF >= 0 && shV.getLastRow() > cabV.linha) {
      var vals = shV.getRange(cabV.linha + 1, 1, shV.getLastRow() - cabV.linha, cabV.cols.length).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (String(vals[i][iVF]).replace(/\D/g, '') === vf) { linhaV = cabV.linha + 1 + i; break; }
      }
    }
    if (linhaV < 0) throw new Error('Não encontrei a VF' + vf + ' na folha Viagens.');
    var iFat = indiceDe_(cabV.cols, [/^(factura|fatura)/i]);
    if (iFat >= 0) {
      var ja = String(shV.getRange(linhaV, iFat + 1).getValue()).trim();
      if (ja && norm(ja) !== norm(numero)) {
        throw new Error('A VF' + vf + ' já tem a fatura ' + ja + ' na folha Viagens (uma viagem por fatura).');
      }
    }

    /* 1) folha Faturas */
    var sh = folhaFaturas_(true);
    var cab = cabecalho_(sh);
    var linha = [];
    for (var k = 0; k < cab.cols.length; k++) linha.push('');
    function por(padroes, v) {
      var j = indiceDe_(cab.cols, padroes);
      if (j >= 0 && v !== '' && v != null) linha[j] = v;
    }
    por([/n[º°o]?\.?\s*(fatura|factura)|^(fatura|factura)/i], numero);
    por([/^data$/i], dados.data || '');
    por([/^cliente/i], dados.cliente || '');
    por([/^(vf|viagem)$/i], vf);
    por([/^valor/i], Math.round(valor * 100) / 100);
    por([/^vencimento/i], dados.vencimento || '');
    por([/^nota/i], dados.nota || '');
    sh.appendRow(linha);

    /* 2) a viagem fica com o nº da fatura (e com o valor, se não o tinha) */
    var escritas = [FOLHA_FATURAS];
    if (iFat < 0) { cabV = garantirColuna_(shV, 'Factura', [/^(factura|fatura)/i]).cab; iFat = indiceDe_(cabV.cols, [/^(factura|fatura)/i]); }
    shV.getRange(linhaV, iFat + 1).setValue(numero);
    var iC = indiceDe_(cabV.cols, [RE_COMBINADO]);
    var combinadoPosto = false;
    if (iC < 0 || !num_(shV.getRange(linhaV, iC + 1).getValue())) {
      if (iC < 0) { cabV = garantirColuna_(shV, COL_COMBINADO, [RE_COMBINADO]).cab; iC = indiceDe_(cabV.cols, [RE_COMBINADO]); }
      shV.getRange(linhaV, iC + 1).setValue(Math.round(valor * 100) / 100);
      combinadoPosto = true;
    }
    escritas.push(FOLHA_VIAGENS);
    return { ok: true, numero: numero, viagem: 'VF' + vf, folhas: escritas, combinadoPosto: combinadoPosto };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------
   Conta do motorista
   ------------------------------------------------------------------ */

/**
 * Conta do motorista numa viagem, a partir do livro geral:
 *   adiantado   = Adiantamentos ao motorista
 *   gasto       = despesas com Meio = Motorista (todas)
 *   justificado = diárias + despesas que não precisam de recibo + as com recibo entregue
 *   devolvido   = Devoluções do motorista
 *   saldo       = adiantado − justificado      (o que ainda tem de justificar)
 *   saldoFinal  = saldo − devolvido            (> 0: tem de devolver ou justificar;
 *                                               < 0: a empresa deve-lhe)
 */
function contaMotorista_(codigo) {
  var vf = String(codigo).replace(/\D/g, '');
  var c = { adiantado: 0, gasto: 0, justificado: 0, porJustificar: 0, diarias: 0, devolvido: 0 };
  var sh = folha_(PLANO_ID, FOLHA_GERAL);
  var cab = cabecalho_(sh);
  if (sh.getLastRow() <= cab.linha) return fecharConta_(c);
  var ix = {
    tipo: indiceDe_(cab.cols, [/^tipo$/i]), cat: indiceDe_(cab.cols, [/categoria/i]),
    meio: indiceDe_(cab.cols, [/^meio/i]), vf: indiceDe_(cab.cols, [/^(vf|viagem)$/i]),
    val: indiceDe_(cab.cols, [/^valor/i, /montante/i]), rec: indiceDe_(cab.cols, [/^recibo/i])
  };
  if (ix.vf < 0 || ix.val < 0) return fecharConta_(c);
  sh.getRange(cab.linha + 1, 1, sh.getLastRow() - cab.linha, cab.cols.length).getValues()
    .forEach(function (r) {
      if (String(r[ix.vf]).replace(/\D/g, '') !== vf) return;
      var v = num_(r[ix.val]), tipo = String(r[ix.tipo] || '');
      var cm = classeMotorista_(tipo);
      if (cm === 'ad') { c.adiantado += v; return; }
      if (cm === 'dev') { c.devolvido += v; return; }
      if (!/^despesa/i.test(tipo) || ix.meio < 0 || !/^motorista/i.test(String(r[ix.meio]).trim())) return;
      var cat = String(r[ix.cat] || '');
      c.gasto += v;
      if (/diari/.test(semAcentos_(cat))) c.diarias += v;
      var semRecibo = ix.rec >= 0 && String(r[ix.rec]).trim() === RECIBO_PENDENTE;
      if (semRecibo) c.porJustificar += v; else c.justificado += v;
    });
  return fecharConta_(c);
}
function fecharConta_(c) {
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  c.saldo = r2(c.adiantado - c.justificado);
  c.saldoFinal = r2(c.saldo - c.devolvido);
  return c;
}

/**
 * Escreve a conta do motorista nas colunas da viagem na folha Viagens
 * (Adiantamento Total Motorista, Despesas Total Justificadas, Saldo
 * Motorista, Devolvido Motorista, Saldo Final Motorista e Diárias).
 * Só escreve em células SEM fórmula, e só nas colunas que existirem.
 */
function sincronizarContaMotorista_(codigo) {
  var vf = String(codigo).replace(/\D/g, '');
  var sh = folha_(PLANO_ID, FOLHA_VIAGENS);
  var cab = cabecalho_(sh);
  var iVF = indiceDe_(cab.cols, [/^vf$/i, /c[óo]digo/i]);
  if (iVF < 0 || sh.getLastRow() <= cab.linha) return null;
  var vals = sh.getRange(cab.linha + 1, iVF + 1, sh.getLastRow() - cab.linha, 1).getValues();
  var linha = -1;
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]).replace(/\D/g, '') === vf) { linha = cab.linha + 1 + i; break; }
  if (linha < 0) return null;
  var c = contaMotorista_(vf);
  var escrever = function (padroes, valor) {
    var k = indiceDe_(cab.cols, padroes);
    if (k < 0) return;
    var cel = sh.getRange(linha, k + 1);
    if (cel.getFormula && cel.getFormula()) return;     // não estragar fórmulas
    cel.setValue(valor);
  };
  escrever([/adiantamento\s*total\s*motorista/i, /^adiantamento.*motorista/i], c.adiantado);
  escrever([/despesas?\s*total\s*justificad/i, /^despesas?\s*justificad/i], c.justificado);
  escrever([/^saldo\s*motorista$/i], c.saldo);
  escrever([/^devolvido\s*motorista/i, /^devolvido$/i], c.devolvido);
  escrever([/saldo\s*final\s*motorista/i], c.saldoFinal);
  if (c.diarias) escrever([/^di[áa]rias$/i], c.diarias);
  return c;
}

/**
 * Separador «Motorista»: adiantamento, despesa paga pelo motorista ou
 * devolução, sempre ligado a uma viagem.
 * `dados`: { movimento: 'adiantamento' | 'despesa' | 'devolucao', viagem, data,
 *            valor, meio, socio, fica, categoria, descricao, reciboEntregue, nota }
 */
function guardarMovimentoMotorista(dados) {
  verificarAcesso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var vf = String(dados.viagem || '').replace(/\D/g, '');
    var valor = num_(dados.valor);
    if (!vf) throw new Error('Escolhe a viagem.');
    if (!(valor > 0)) throw new Error('Indica o valor.');
    var motorista = dadosDaViagem_('VF' + vf).motorista || 'Motorista';
    var folhas = [FOLHA_GERAL], aviso = null, linha;

    if (dados.movimento === 'adiantamento') {
      if (!/^(Caixa|Banco|Sócio)$/.test(dados.meio || '')) throw new Error('Indica de onde saiu o dinheiro: Caixa, Banco ou Sócio.');
      var pago = pagamentoDoSocio_(dados);
      linha = { data: dados.data, tipo: TIPO_ADIANT_MOTORISTA, categoria: 'Adiantamento motorista',
        descricao: dados.descricao || ('Adiantamento a ' + motorista + ' · VF' + vf), valor: valor,
        meio: dados.meio, quem: motorista, viagem: vf, nota: dados.nota || (pago ? 'pago por ' + pago.socio : '') };
      escreverGeral_(linha);
      if (pago) {
        aviso = registarDespesaDoSocio_(pago.socio, { data: dados.data, categoria: 'Adiantamento motorista',
          descricao: 'Adiantamento a ' + motorista + ' · VF' + vf, valor: valor, viagem: vf,
          fica: pago.fica, tipoAdiantamento: 'Adiantamento do sócio' });
        if (!aviso) folhas.push(FOLHA_MOVS); else aviso = 'Conta de ' + pago.socio + ': ' + aviso;
      }
    } else if (dados.movimento === 'despesa') {
      if (!String(dados.categoria || '').trim()) throw new Error('Indica a categoria (Portagens, Diárias, Despesas extras…).');
      linha = { data: dados.data, tipo: 'Despesa', categoria: dados.categoria,
        descricao: dados.descricao || (dados.categoria + ' · VF' + vf), valor: valor,
        meio: MEIO_MOTORISTA, quem: motorista, viagem: vf, nota: dados.nota, reciboEntregue: dados.reciboEntregue };
      linha.recibo = estadoRecibo_(linha);
      escreverGeral_(linha);
    } else if (dados.movimento === 'devolucao') {
      if (!/^(Caixa|Banco)$/.test(dados.meio || '')) throw new Error('Indica para onde voltou o dinheiro: Caixa ou Banco.');
      escreverGeral_({ data: dados.data, tipo: TIPO_DEVOL_MOTORISTA, categoria: 'Adiantamento motorista',
        descricao: dados.descricao || ('Devolução de ' + motorista + ' · VF' + vf), valor: valor,
        meio: dados.meio, quem: motorista, viagem: vf, nota: dados.nota });
    } else {
      throw new Error('Escolhe o tipo de movimento.');
    }

    var conta = null;
    try { conta = sincronizarContaMotorista_(vf); folhas.push(FOLHA_VIAGENS); }
    catch (e) { aviso = (aviso ? aviso + ' · ' : '') + 'Folha Viagens: ' + (e.message || e); }
    return { ok: true, folhas: folhas, aviso: aviso, conta: conta || contaMotorista_(vf), motorista: motorista };
  } finally {
    lock.releaseLock();
  }
}

/** Conta do motorista de uma viagem, para o formulário. */
function obterContaMotorista(codigo) {
  verificarAcesso_();
  var vf = String(codigo || '').replace(/\D/g, '');
  if (!vf) return null;
  var c = contaMotorista_(vf);
  c.motorista = dadosDaViagem_('VF' + vf).motorista;
  return c;
}

/** Códigos de viagem existentes, para o formulário de abastecimentos. */
function listarViagens() {
  verificarAcesso_();
  var sh = folha_(PLANO_ID, FOLHA_VIAGENS);
  var cab = cabecalho_(sh);
  var iVF = indiceDe_(cab.cols, [/^vf$/i, /c[óo]digo/i]);
  if (iVF < 0 || sh.getLastRow() <= cab.linha) return [];
  return sh.getRange(cab.linha + 1, iVF + 1, sh.getLastRow() - cab.linha, 1)
    .getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (v) { return v; })
    .reverse();
}
