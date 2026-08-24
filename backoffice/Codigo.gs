/**
 * Back office da Nova Logística, Lda
 * ----------------------------------
 * App web (Google Apps Script) para LANÇAR dados nas folhas do Google Sheets.
 * A app de consulta (o site) continua só a ler — quem escreve é este back office.
 *
 * Instalação: ver backoffice/README.md
 */

/* IDs dos ficheiros no Drive (os mesmos que o site usa) */
var PLANO_ID = '1iLkuI2Lom-klgfCtcrfSJMvbitZpXpWGPzoSQjZ0G1I';   // Plano_Investimento_Transportes
var ABAST_ID = '1bpq6tAXb40dbZ0G945FxKanbIipnRDStO_nhYuuaxKo';   // planilha de abastecimentos

var FOLHA_VIAGENS  = 'Viagens';
var FOLHA_VIATURAS = 'Viaturas';
var FOLHA_MOVS     = 'Movimentos Investimentos';   // o livro de contas
var FOLHA_SOCIOS   = 'Sócios - Contas Correntes';

/* Tipos possíveis de um movimento (o que o formulário oferece). */
var TIPOS = ['Investimento', 'Despesa', 'Suprimento', 'Recebimento'];

/* Quem pode lançar dados. Lista vazia = qualquer pessoa com o link
   (só faz sentido se a app for publicada apenas para a organização). */
var EMAILS_AUTORIZADOS = [
  'nunotiago.mz@gmail.com'
];

/* ---------------------------------------------------------------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Formulario')
    .setTitle('Nova Logística · Lançamentos')
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

/** Cabeçalhos de uma folha (1.ª linha preenchida, até 10 linhas). */
function cabecalho_(sh) {
  var valores = sh.getRange(1, 1, Math.min(10, sh.getLastRow() || 1), sh.getLastColumn() || 1).getValues();
  for (var i = 0; i < valores.length; i++) {
    var preenchidas = valores[i].filter(function (c) { return String(c).trim(); }).length;
    if (preenchidas >= 2) return { linha: i + 1, cols: valores[i].map(function (c) { return String(c).trim(); }) };
  }
  return { linha: 1, cols: [] };
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
function criarFolhaAbastecimentos_(nomeFolha) {
  var ss = SpreadsheetApp.openById(ABAST_ID);
  if (ss.getSheetByName(nomeFolha)) return;
  var sh = ss.insertSheet(nomeFolha);
  sh.appendRow(['Data', 'Local', 'Litros', 'Preço/Litro', 'Valor (MZN)', 'Km']);
  sh.getRange(1, 1, 1, 6).setFontWeight('bold');
  sh.setFrozenRows(1);
}

/** Grava um abastecimento na folha da viagem indicada. */
function guardarAbastecimento(codigo, dados) {
  verificarAcesso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var nomeFolha = 'VF' + String(codigo).replace(/\D/g, '');
    criarFolhaAbastecimentos_(nomeFolha);
    var sh = folha_(ABAST_ID, nomeFolha);
    var litros = Number(dados.litros) || 0;
    var preco = Number(dados.preco) || 0;
    sh.appendRow([
      dados.data || '',
      dados.local || '',
      litros,
      preco,
      dados.valor ? Number(dados.valor) : (litros * preco),
      dados.km ? Number(dados.km) : ''
    ]);
    return { ok: true, folha: nomeFolha };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Dados para o formulário de movimentos: colunas do livro, nomes dos sócios
 * (que são colunas próprias) e as categorias já usadas.
 */
function obterConfiguracaoMovimentos() {
  verificarAcesso_();
  var sh = folha_(PLANO_ID, FOLHA_MOVS);
  var cab = cabecalho_(sh);
  var ultima = sh.getLastRow();
  var dados = ultima > cab.linha
    ? sh.getRange(cab.linha + 1, 1, ultima - cab.linha, cab.cols.length).getValues()
    : [];

  /* sócios: cabeçalhos do livro que batem com a folha de contas correntes */
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

  var socioCols = socios.filter(function (nome) {
    return cab.cols.some(function (c) { return c.toLowerCase() === nome.toLowerCase(); });
  });

  var iCat = indiceDe_(cab.cols, [/categoria/i]);
  var categorias = [];
  if (iCat >= 0) {
    dados.forEach(function (r) {
      var v = String(r[iCat]).trim();
      if (v && categorias.indexOf(v) === -1) categorias.push(v);
    });
    categorias.sort();
  }

  return {
    colunas: cab.cols.filter(function (c) { return c; }),
    socios: socioCols.length ? socioCols : socios,
    categorias: categorias,
    tipos: TIPOS,
    temTipo: indiceDe_(cab.cols, [/^tipo$/i]) >= 0,
    temCategoria: iCat >= 0
  };
}

/**
 * Grava um movimento no livro de contas.
 * `dados`: { data, item, descricao, tipo, categoria, viagem, socio, valor }
 * O valor vai para a coluna do sócio que pagou.
 */
function guardarMovimento(dados) {
  verificarAcesso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = folha_(PLANO_ID, FOLHA_MOVS);
    var cab = cabecalho_(sh);

    var valor = Number(dados.valor);
    if (!valor) throw new Error('Indica um valor.');
    var socio = String(dados.socio || '').trim();
    if (!socio) throw new Error('Indica quem pagou.');

    var iSocio = -1;
    for (var i = 0; i < cab.cols.length; i++) {
      if (cab.cols[i].toLowerCase() === socio.toLowerCase()) { iSocio = i; break; }
    }
    if (iSocio < 0) throw new Error('Não existe uma coluna para «' + socio + '» no livro de movimentos.');

    var linha = [];
    for (var j = 0; j < cab.cols.length; j++) linha.push('');
    function por(padroes, valorCelula) {
      var k = indiceDe_(cab.cols, padroes);
      if (k >= 0 && valorCelula !== '' && valorCelula != null) linha[k] = valorCelula;
    }
    por([/^data$/i], dados.data || '');
    por([/^item$/i], dados.item || '');
    por([/descri/i, /nota/i], dados.descricao || '');
    por([/^tipo$/i], dados.tipo || '');
    por([/categoria/i], dados.categoria || '');
    por([/^(vf|viagem)$/i], dados.viagem ? String(dados.viagem).replace(/\D/g, '') : '');
    linha[iSocio] = valor;

    sh.appendRow(linha);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
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
