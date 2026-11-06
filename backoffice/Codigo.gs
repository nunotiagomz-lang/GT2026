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
var ABAST_ID = '1bpq6tAXb40dbZ0G945FxKanbIipnRDStO_nhYuuaxKo';   // planilha de abastecimentos

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

/* Tipos que o formulário «Investimentos» oferece (livro dos sócios).
   Devolução e Dividendo são dinheiro que sai para o sócio — a app
   desconta-os ao que ele tem investido. */
var TIPOS_INVESTIDORES = ['Investimento', 'Suprimento', 'Devolução', 'Dividendo'];

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
 * Cabeçalho de uma folha de abastecimentos. Aqui não serve a regra do
 * cabecalho_ ("primeira linha com 2 células"), porque essa apanharia o bloco
 * de título da viagem ("Viagem | VF56"). O cabeçalho é a linha com MAIS
 * células preenchidas das primeiras — a mesma regra que a app de consulta usa.
 */
function cabecalhoAbast_(sh) {
  var n = Math.min(10, sh.getLastRow() || 1);
  var valores = sh.getRange(1, 1, n, sh.getLastColumn() || 1).getValues();
  var melhor = -1, quantas = 0;
  for (var i = 0; i < valores.length; i++) {
    var preenchidas = valores[i].filter(function (c) { return String(c).trim(); }).length;
    if (preenchidas > quantas) { quantas = preenchidas; melhor = i; }
  }
  if (melhor < 0 || quantas < 3) return { linha: 1, cols: [] };
  return {
    linha: melhor + 1,
    cols: valores[melhor].map(function (c) { return String(c).trim(); })
  };
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
  var iVia  = indiceDe_(cab.cols, [/viatura|matr[íi]cula/i]);
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

  return {
    colunas: cab.cols.filter(function (c) { return c; }),
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
function guardarViagem(valores) {
  verificarAcesso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);                    // evita duas gravações em simultâneo
  try {
    var sh = folha_(PLANO_ID, FOLHA_VIAGENS);
    var cab = cabecalho_(sh);
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
    criarFolhaAbastecimentos_(nomeFolha);

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
    var iMat = indiceDe_(cab.cols, [/viatura|matr[íi]cula/i]);
    var iMot = indiceDe_(cab.cols, [/motorista|condutor/i]);
    var iTra = indiceDe_(cab.cols, [/trajecto|trajeto|rota|percurso|prov[íi]ncia|destino/i]);
    var dados = sh.getRange(cab.linha + 1, 1, sh.getLastRow() - cab.linha, cab.cols.length).getValues();
    for (var i = dados.length - 1; i >= 0; i--) {      // a mais recente, se houver repetidos
      if (iVF < 0) break;
      if (String(dados[i][iVF]).replace(/\D/g, '') !== numero) continue;
      if (iMat >= 0) out.matricula = String(dados[i][iMat]).trim();
      if (iMot >= 0) out.motorista = String(dados[i][iMot]).trim();
      if (iTra >= 0) out.trajecto = String(dados[i][iTra]).trim();
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

  /* identificação da viagem, em pares rótulo/valor para não se confundirem
     com o cabeçalho da tabela (que é a linha com mais células preenchidas) */
  var v = dadosDaViagem_(nomeFolha);
  sh.appendRow(['Viagem', nomeFolha]);
  sh.appendRow(['Matrícula', v.matricula]);
  sh.appendRow(['Motorista', v.motorista]);
  sh.appendRow(['Trajecto', v.trajecto]);
  sh.appendRow([]);
  sh.getRange(1, 1, 4, 1).setFontWeight('bold');

  sh.appendRow(COLUNAS_ABAST);
  var linhaCab = sh.getLastRow();
  sh.getRange(linhaCab, 1, 1, COLUNAS_ABAST.length).setFontWeight('bold');
  sh.setFrozenRows(linhaCab);
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
    var total = dados.valor ? num_(dados.valor) : (litros * preco);
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
        meio: dados.meio || '',
        quem: dados.quem || dados.bomba || '',
        viagem: nomeFolha,
        nota: litros ? litros + ' L' + (preco ? ' a ' + preco + ' MZN/L' : '') : ''
      });
      if (!aviso) escritas.push(FOLHA_GERAL);
    }
    return { ok: true, folha: nomeFolha, total: total, folhas: escritas, aviso: aviso };
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
  sh.appendRow(linha);
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
    escreverGeral_(dados);
    return { ok: true, folhas: [FOLHA_GERAL] };
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
    var cabI = cabecalho_(shI);

    /* casa cada sócio com a coluna dele e soma o total */
    var total = 0, contribuintes = [], colunas = {};
    for (var nome in valores) {
      var v = num_(valores[nome]);
      if (!v) continue;
      var idx = -1;
      for (var j = 0; j < cabI.cols.length; j++) {
        if (cabI.cols[j].toLowerCase() === String(nome).toLowerCase()) { idx = j; break; }
      }
      if (idx < 0) {
        throw new Error('«' + nome + '» não tem coluna na folha ' + shI.getName() +
          ' — acrescenta-a antes de lançar.');
      }
      colunas[idx] = v;
      contribuintes.push(nome);
      total += v;
    }
    if (!total) throw new Error('Preenche o valor de pelo menos um sócio.');

    /* 1) livro dos investidores: uma linha, o valor de cada sócio na sua coluna */
    var linhaI = [];
    for (var i = 0; i < cabI.cols.length; i++) linhaI.push('');
    function porI(padroes, v) {
      var k = indiceDe_(cabI.cols, padroes);
      if (k >= 0 && v !== '' && v != null) linhaI[k] = v;
    }
    porI([/^data$/i], dados.data || '');
    /* Item = o "quê" (categoria), Descrição = o detalhe — como na folha atual */
    porI([/^item$/i], dados.categoria || dados.descricao || dados.tipo || '');
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
      meio: 'Sócio',
      quem: contribuintes.join(', '),
      viagem: dados.viagem,
      nota: dados.nota
    });

    var folhasInv = [shI.getName()];
    if (!avisoInv) folhasInv.push(FOLHA_GERAL);
    return { ok: true, total: total, folhas: folhasInv, aviso: avisoInv };
  } finally {
    lock.releaseLock();
  }
}

/** Entrada (dinheiro que chega) ou saída, a partir do tipo. */
function sentidoDe_(tipo) {
  var t = String(tipo || '').toLowerCase();
  return (t.indexOf('supriment') === 0 || t.indexOf('recebiment') === 0) ? 'Entrada' : 'Saída';
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
