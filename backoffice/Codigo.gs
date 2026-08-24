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

  /* quem já apareceu em «Pago Por»: sócios, fornecedores, clientes */
  var pagadores = [];
  function juntarPagadores(sh) {
    var cab = cabecalho_(sh);
    var iP = indiceDe_(cab.cols, [/pago\s*por|contraparte|fornecedor/i]);
    if (iP < 0 || sh.getLastRow() <= cab.linha) return;
    sh.getRange(cab.linha + 1, iP + 1, sh.getLastRow() - cab.linha, 1)
      .getValues().forEach(function (r) {
        var v = String(r[0]).trim();
        if (v && pagadores.indexOf(v) === -1) pagadores.push(v);
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
    tipos: TIPOS,
    pagadorEmpresa: PAGADOR_EMPRESA,
    temGeral: temGeral,
    colunasGeral: colunasGeral
  };
}

/**
 * Lançamento de contas.
 * Escreve SEMPRE no livro geral (`Movimentos Geral`). Quando quem pagou foi
 * um sócio, escreve TAMBÉM no livro dos investidores, na coluna desse sócio —
 * é isso que mantém a conta corrente dos sócios correta, tanto para
 * investimentos como para despesas adiantadas por eles.
 *
 * `dados`: { data, tipo, categoria, descricao, valor, meio, quem, viagem, nota }
 */
function guardarMovimento(dados) {
  verificarAcesso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var valor = Number(dados.valor);
    if (!valor) throw new Error('Indica um valor.');
    var quem = String(dados.quem || '').trim();
    if (!quem) throw new Error('Indica quem pagou ou recebeu.');

    var cfg = obterConfiguracaoMovimentos();
    var eSocio = cfg.socios.some(function (s) { return s.toLowerCase() === quem.toLowerCase(); });
    var escritas = [];

    /* 1) livro geral — sempre */
    var shG = folha_(PLANO_ID, FOLHA_GERAL);
    var cabG = cabecalho_(shG);
    var linhaG = [];
    for (var i = 0; i < cabG.cols.length; i++) linhaG.push('');
    function porG(padroes, v) {
      var k = indiceDe_(cabG.cols, padroes);
      if (k >= 0 && v !== '' && v != null) linhaG[k] = v;
    }
    porG([/^data$/i], dados.data || '');
    porG([/^tipo$/i], dados.tipo || '');
    porG([/categoria/i], dados.categoria || '');
    porG([/descri/i, /^item$/i], dados.descricao || '');
    porG([/^valor/i, /montante/i], valor);
    porG([/sentido|natureza|entrada/i], sentidoDe_(dados.tipo));
    porG([/^meio/i, /forma\s*de\s*pagamento/i, /^conta$/i],
         dados.meio || (eSocio ? 'Sócio' : ''));
    porG([/pago\s*por|respons|contraparte|fornecedor/i], quem);
    porG([/^(vf|viagem)$/i], dados.viagem ? String(dados.viagem).replace(/\D/g, '') : '');
    porG([/nota|observ/i], dados.nota || '');
    shG.appendRow(linhaG);
    escritas.push(FOLHA_GERAL);

    /* 2) livro dos investidores — só quando quem pagou foi um sócio */
    if (eSocio) {
      var shI = folhaEntre_(PLANO_ID, [FOLHA_MOVS, FOLHA_MOVS_ALT]);
      var cabI = cabecalho_(shI);
      var iSocio = -1;
      for (var j = 0; j < cabI.cols.length; j++) {
        if (cabI.cols[j].toLowerCase() === quem.toLowerCase()) { iSocio = j; break; }
      }
      if (iSocio < 0) {
        throw new Error('Movimento gravado no livro geral, mas «' + quem +
          '» não tem coluna no livro dos investidores — acrescenta-a para a conta corrente ficar certa.');
      }
      var linhaI = [];
      for (var k2 = 0; k2 < cabI.cols.length; k2++) linhaI.push('');
      function porI(padroes, v) {
        var k = indiceDe_(cabI.cols, padroes);
        if (k >= 0 && v !== '' && v != null) linhaI[k] = v;
      }
      porI([/^data$/i], dados.data || '');
      porI([/^item$/i], dados.descricao || dados.categoria || '');
      porI([/descri/i, /nota/i], dados.descricao || '');
      porI([/^tipo$/i], dados.tipo || '');
      porI([/categoria/i], dados.categoria || '');
      porI([/^(vf|viagem)$/i], dados.viagem ? String(dados.viagem).replace(/\D/g, '') : '');
      linhaI[iSocio] = valor;
      shI.appendRow(linhaI);
      escritas.push(shI.getName());
    }

    return { ok: true, folhas: escritas };
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
