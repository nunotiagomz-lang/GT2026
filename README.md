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
| Resumo | — | `Resumo` | Indicadores gerais + barra de execução do investimento |
| Investimentos | Movimentos | `Movimentos Investimentos` | Lista de movimentos, filtrável por sócio |
| Investimentos | Plano | `Investimentos Iniciais` | Itens do plano com progresso pago/estimado e totais |
| Investimentos | Sócios | `Sócios - Contas Correntes` | Cartão por sócio: pago, quota e saldo (credor / falta contribuir) |
| Investimentos | Acertos | `Acertos entre Sócios` | Tabela de reembolsos entre sócios |

No futuro, áreas novas (Faturação, Vendas, Recursos Humanos, …) entram como novos
separadores em baixo, cada uma com os seus próprios sub-separadores.

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
