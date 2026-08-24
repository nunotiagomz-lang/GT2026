# CNET Logistics, Lda · Gestão

App web (só de consulta) para os sócios da CNET Logistics, Lda acompanharem a
gestão da empresa — investimentos, viagens, viaturas e contas. Os dados vêm
**sempre** do ficheiro Google Sheets **`CNET LOGISTICS MGMT`** no Google Drive —
a app não edita nada, apenas apresenta. Cada vez que alguém abre (ou volta a
abrir) a página, os dados são lidos de novo do ficheiro, por isso qualquer
alteração no Excel aparece automaticamente.

Tudo está num único ficheiro: **`index.html`**. Sem servidores, sem base de dados,
sem dependências.

## Navegação

Em baixo há um separador por **área** da empresa; dentro de cada área, os
sub-separadores no topo mostram as folhas do Excel dessa área.

| Área (em baixo) | Sub-separador (em cima) | Folha do Excel | Apresentação |
|---|---|---|---|
| Resumo | — | `Resumo` + cálculos das outras folhas | Dashboard: alertas, operação, execução, sócios, últimos movimentos, próximos pagamentos |
| Viagens | Viagens | `Viagens` | Lista com margem por viagem → detalhe → abastecimentos e consumo |
| Viagens | Motoristas | `Viagens` (derivado) | Ficha por motorista: viagens, km, margem, saldo |
| Viagens | Clientes | `Viagens` (derivado) | Ficha por cliente: viagens, faturado, margem |
| Viaturas | — | `Viaturas` (+ `Viagens`) | Frota com consumo esperado → ficha da viatura e as suas viagens |
| Contas | Investimentos | `Movimentos dos Investidores` (+ sócios, acertos) | Tudo o que passa pelos sócios: contas correntes, movimentos e acertos |
| Contas | Movimentos Correntes | `Movimentos Geral` | Contabilidade e tesouraria de toda a empresa |
| Faturação | — | *(em breve)* | — |

### Os dois livros de contas

**`Movimentos Geral`** é o livro principal: **todos** os movimentos da empresa,
uma linha por lançamento com um valor único.

| Coluna | Para que serve |
|---|---|
| `Data` | data do movimento |
| `Tipo` | `Investimento` (dura anos), `Despesa` (consome-se agora), `Suprimento` (entrada de um sócio), `Recebimento` |
| `Categoria` | Camião, Combustível, Portagens, Motorista, Manutenção, Seguros… |
| `Descrição` | o que foi |
| `Valor (MZN)` | sempre positivo — o sentido vem do tipo |
| `Sentido` | opcional (`Entrada` / `Saída`); sem ela, deduz-se do tipo |
| `Meio` | `Caixa`, `Banco` ou `Sócio` — é o que dá a tesouraria |
| `Pago por` | sócio, fornecedor ou cliente |
| `VF` | liga o movimento à viagem (toca no código para a abrir) |

**`Movimentos dos Investidores`** continua a ser o livro dos sócios — investimento,
futuros dividendos e devoluções de capital. Mantém **uma coluna por sócio**, e é
dele que sai a conta corrente de cada um.

A app **calcula** as contas correntes a partir da soma desse livro — o livro
geral da empresa não entra nesta conta:

- **Pago** = soma da coluna do sócio (movimentos de tipo `Devolução` ou
  `Dividendo` contam ao contrário, porque é dinheiro que sai para o sócio);
- **Quota** = total investido × participação do sócio (divisão igual se a
  participação não estiver preenchida);
- **Saldo** = pago + acertos − quota. Positivo = credor; negativo = falta
  contribuir. A soma dos saldos dá sempre zero.

Basta, por isso, ter na folha `Sócios - Contas Correntes` os **nomes** e as
**participações** — os valores são recalculados pela app a cada abertura.

Um lançamento pago por um sócio entra nos **dois** livros: no geral para o
controlo da empresa, e no dos investidores na coluna desse sócio. Pago pela
empresa (caixa ou banco), entra só no geral. É o formulário que trata disto —
ver [`backoffice/README.md`](backoffice/README.md).

### Sub-separadores que se adaptam ao Excel

Cada vista sabe qual o cabeçalho que espera na sua folha. Se apagares ou
reestruturares uma folha (por exemplo, deixares de usar o Plano), o
sub-separador **desaparece sozinho** em vez de mostrar os dados de outra folha —
o Google devolve a primeira folha do ficheiro quando o nome pedido não existe, e
a app deteta esse caso.

**Pesquisa global** (lupa no topo) encontra viagens, motoristas, viaturas e
clientes — ignora acentos. O **filtro de período** (Tudo / Este mês / 3 meses /
Este ano) aplica-se às vistas operacionais e usa a coluna de data das viagens.

### Cálculos automáticos

A app não se limita a mostrar as folhas — cruza-as:

- **Margem por viagem** = receita − despesas, com margem/km. Viagens com margem
  negativa geram alerta no Resumo.
- **Consumo real vs esperado** — litros dos abastecimentos ÷ km da viagem,
  comparado com o consumo da folha `Viaturas`. Acima de 10% de desvio, avisa.
- **Fichas ligadas** — motorista, viatura e cliente agregam as respetivas
  viagens, km e margens.

Todas as colunas são detetadas pelo nome (ex.: `Km`, `Receita`, `Despesas
Total`, `Motorista`, `Viatura`, `Cliente`, `Partida`). Se uma coluna não
existir, a app simplesmente não mostra esse cálculo — nada rebenta.

### Abastecimentos (ficheiro separado)

Os abastecimentos vêm de um segundo ficheiro no Drive, chamado
**«planilha de abastecimentos»**, com **uma folha por viagem** cujo nome é o
código da viagem (ex.: `vf15`). No detalhe de uma viagem, o botão
"⛽ Abastecimentos" abre a folha correspondente.

Para ligar: partilhar esse ficheiro como «Qualquer pessoa com o link — Leitor»
e colocar o ID do ficheiro na constante `ABASTECIMENTOS_ID` no topo do
`<script>` de `index.html` (o ID é a parte do link entre `/d/` e `/edit`).

## Lançamento de dados (back office)

O site é só de consulta. Para **lançar** viagens e abastecimentos há um
formulário próprio em Google Apps Script, que grava direto nas folhas — ver
[`backoffice/README.md`](backoffice/README.md). Grátis, sem servidor, e o Excel
continua a ser a base de dados.

## App instalável e offline

`manifest.webmanifest` + `sw.js` fazem da página uma app instalável: no
telemóvel, "Adicionar ao ecrã principal" dá-lhe ícone próprio e ela abre sem
rede, mostrando os últimos dados guardados (com aviso da data).

## Roadmap (ideias já acordadas para o futuro)

- **Faturação** (separador em baixo, por ativar): faturas emitidas e clientes,
  com **aging de recebíveis** (quem deve, quanto, há quantos dias) e alertas de
  vencidos no Resumo. Incluir como sub-separadores a **Tesouraria** (caixa/banco,
  entradas e saídas) e os **Resultados mensais (P&L)** com evolução ao longo dos
  meses.
- **Viaturas** (separador em baixo, por ativar): manutenções por viatura
  (revisões, pneus com km, avarias, custos, próximas intervenções) e
  **documentação de cada viatura** vinda de uma pasta do Drive organizada por
  matrícula (seguro, inspeção, licenças, com validades e alertas no Resumo).
- **Privacidade**: quando entrarem dados de faturação/clientes/salários,
  ponderar um PIN de acesso na app ou alojamento com login.

## Requisito único: partilha do ficheiro

No Google Drive, o ficheiro `CNET LOGISTICS MGMT` tem de estar partilhado
como **«Qualquer pessoa com o link» → «Leitor»** (Partilhar → Acesso geral).
Sem isto a app não consegue ler os dados. Ninguém consegue editar por essa via —
apenas ler.

## Publicar o site (GitHub Pages)

1. Fazer merge deste branch para `main`.
2. No GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / root**.
3. O link para os sócios fica: `https://nunotiagomz-lang.github.io/GT2026/`.

No telemóvel, ao abrir o link podem usar «Adicionar ao ecrã principal» para ficar
com ícone de app.

## Quando o Excel crescer (faturação, vendas, contas da empresa…)

Adicionar uma área nova ao array `NAV` no topo do `<script>` em `index.html` —
cada entrada de `views` é um sub-separador no topo dessa área:

```js
{ id: "faturacao", label: "Faturação",
  icon: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  views: [
    { id: "vendas",   sheet: "Vendas",   label: "Vendas",   render: "auto" },
    { id: "despesas", sheet: "Despesas", label: "Despesas", render: "auto" },
  ] },
```

`render: "auto"` mostra a folha como tabela sem mais programação; para uma
apresentação personalizada, criar um renderer novo (ver `renderMovimentos`,
`renderSocios`, etc. como exemplos). Com uma só view, a barra de sub-separadores
não aparece.

## Notas técnicas

- Os dados são lidos folha a folha via CSV (`gviz/tq?tqx=out:csv&sheet=...`).
- Há cache local (`localStorage`): sem internet, a app mostra os últimos dados
  guardados com aviso da data.
- Suporta tema claro e escuro automaticamente.
- Para testar localmente com CSVs de exemplo: `index.html?src=<pasta-com-csvs>`,
  onde a pasta contém um `<NomeDaFolha>.csv` por folha.
