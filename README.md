# Nova Logística, Lda · Plano de Investimento

App web (só de consulta) para os sócios da Nova Logística, Lda acompanharem o plano de
investimento. Os dados vêm **sempre** do ficheiro Google Sheets
**`Plano_Investimento_Transportes`** no Google Drive — a app não edita nada, apenas
apresenta. Cada vez que alguém abre (ou volta a abrir) a página, os dados são lidos
de novo do ficheiro, por isso qualquer alteração no Excel aparece automaticamente.

Tudo está num único ficheiro: **`index.html`**. Sem servidores, sem base de dados,
sem dependências.

## Navegação

Em baixo há um separador por **área** da empresa; dentro de cada área, os
sub-separadores no topo mostram as folhas do Excel dessa área.

| Área (em baixo) | Sub-separador (em cima) | Folha do Excel | Apresentação |
|---|---|---|---|
| Resumo | — | `Resumo` + cálculos das outras folhas | Dashboard: alertas, execução, sócios, últimos movimentos, próximos pagamentos |
| Investimentos | Movimentos | `Movimentos Investimentos` | Lista de movimentos (colunas por sócio), filtrável por sócio |
| Investimentos | Plano | `Investimentos Iniciais` | Itens do plano com progresso pago/estimado e totais |
| Investimentos | Sócios | `Sócios - Contas Correntes` | Cartão por sócio: pago, quota e saldo (credor / falta contribuir) |
| Investimentos | Acertos | `Acertos entre Sócios` | Tabela de reembolsos entre sócios |
| Viagens | — | `Viagens` | Lista de viagens → detalhe da viagem → abastecimentos |
| Faturação | — | *(em breve)* | — |
| Viaturas | — | *(em breve)* | — |

### Abastecimentos (ficheiro separado)

Os abastecimentos vêm de um segundo ficheiro no Drive, chamado
**«planilha de abastecimentos»**, com **uma folha por viagem** cujo nome é o
código da viagem (ex.: `vf15`). No detalhe de uma viagem, o botão
"⛽ Abastecimentos" abre a folha correspondente.

Para ligar: partilhar esse ficheiro como «Qualquer pessoa com o link — Leitor»
e colocar o ID do ficheiro na constante `ABASTECIMENTOS_ID` no topo do
`<script>` de `index.html` (o ID é a parte do link entre `/d/` e `/edit`).

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

No Google Drive, o ficheiro `Plano_Investimento_Transportes` tem de estar partilhado
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
