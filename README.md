# Nova Logistics · Plano de Investimento

App web (só de consulta) para os sócios da Nova Logistics acompanharem o plano de
investimento. Os dados vêm **sempre** do ficheiro Google Sheets
**`Plano_Investimento_Transportes`** no Google Drive — a app não edita nada, apenas
apresenta. Cada vez que alguém abre (ou volta a abrir) a página, os dados são lidos
de novo do ficheiro, por isso qualquer alteração no Excel aparece automaticamente.

Tudo está num único ficheiro: **`index.html`**. Sem servidores, sem base de dados,
sem dependências.

## Separadores

| Separador | Folha do Excel | Apresentação |
|---|---|---|
| Resumo | `Resumo` | Indicadores gerais + barra de execução do investimento |
| Movimentos | `Movimentos Investimentos` | Lista de movimentos, filtrável por sócio |
| Plano | `Investimentos Iniciais` | Itens do plano com progresso pago/estimado e totais |
| Sócios | `Sócios - Contas Correntes` | Cartão por sócio: pago, quota e saldo (credor / falta contribuir) |
| Acertos | `Acertos entre Sócios` | Tabela de reembolsos entre sócios |

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

Adicionar uma entrada ao array `TABS` no topo do `<script>` em `index.html`:

```js
{ id: "faturacao", sheet: "Faturação", label: "Faturação", render: "auto",
  icon: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>' },
```

`render: "auto"` mostra a folha como tabela sem mais programação; para uma
apresentação personalizada, criar um renderer novo (ver `renderMovimentos`,
`renderSocios`, etc. como exemplos).

## Notas técnicas

- Os dados são lidos folha a folha via CSV (`gviz/tq?tqx=out:csv&sheet=...`).
- Há cache local (`localStorage`): sem internet, a app mostra os últimos dados
  guardados com aviso da data.
- Suporta tema claro e escuro automaticamente.
- Para testar localmente com CSVs de exemplo: `index.html?src=<pasta-com-csvs>`,
  onde a pasta contém um `<NomeDaFolha>.csv` por folha.
