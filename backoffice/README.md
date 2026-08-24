# Back office — lançamento de dados

O site (`index.html`) é **só de consulta**. Este back office é a peça que falta:
um formulário no telemóvel, com listas de escolha e validação, que **grava
diretamente nas folhas do Google Sheets**. O Excel continua a ser a base de
dados — não há servidor nem custo.

Corre no Google Apps Script, dentro da conta Google da empresa.

## O que faz

- **Nova viagem** — o formulário é construído a partir das colunas reais da
  folha `Viagens`: se acrescentares uma coluna no Excel, ela aparece aqui
  sozinha. Sugere o próximo código VF, oferece listas de escolha para viatura
  (da folha `Viaturas`), motorista e cliente (do histórico), e ao guardar **cria
  automaticamente a folha da viagem** (ex.: `VF53`) na planilha de
  abastecimentos.
- **Abastecimento** — escolhes a viagem e lanças data, local, litros, preço e
  km. O valor total é calculado (litros × preço) e a linha vai para a folha
  dessa viagem.
- **Contas** — o lançamento de contas: data, **tipo** (Investimento / Despesa /
  Suprimento / Recebimento), **categoria**, descrição, valor, **quem pagou**,
  meio (caixa / banco / sócio), viagem e nota.

  É aqui que está a regra importante: o lançamento entra **sempre** em
  `Movimentos Geral`; e quando quem pagou foi um **sócio**, entra **também** em
  `Movimentos dos Investidores`, na coluna desse sócio. É isso que mantém a
  conta corrente certa — tanto para investimentos como para despesas que um
  sócio adianta. Pago pela empresa (caixa ou banco), fica só no livro geral.
  O formulário diz-te, antes de gravares, em que folhas vai escrever.

## Instalação (uma vez, ~5 minutos)

1. Vai a [script.google.com](https://script.google.com) → **Novo projeto**.
2. Renomeia o projeto para `CNET Logistics — Back office`.
3. Cola o conteúdo de `Codigo.gs` no ficheiro `Código.gs` que já existe.
4. **+ (Ficheiros) → HTML**, dá-lhe o nome **`Formulario`** (sem acento, tal
   como está no código) e cola o conteúdo de `Formulario.html`.
5. Confirma no topo de `Codigo.gs` os IDs dos ficheiros e a lista
   `EMAILS_AUTORIZADOS` — acrescenta os emails dos sócios que podem lançar dados.
6. **Implementar → Nova implementação → Aplicação Web**:
   - *Executar como*: **Eu**
   - *Quem tem acesso*: **Qualquer pessoa com uma Conta Google**
     (o código só deixa passar os emails autorizados)
7. Autoriza quando o Google pedir e guarda o link que aparece no fim.

No telemóvel, abre esse link e usa "Adicionar ao ecrã principal" — fica com
ícone próprio, ao lado da app de consulta.

## Notas

- **Lançar e consultar são coisas separadas** de propósito: o link do site pode
  ser partilhado à vontade com os sócios, e só quem estiver em
  `EMAILS_AUTORIZADOS` consegue escrever.
- As datas são gravadas em `dd/mm/aaaa`, como o site as lê.
- Duas pessoas a gravar ao mesmo tempo não se atropelam (o script usa um
  bloqueio e recalcula o código VF no momento da gravação).
- Sempre que mudares a estrutura das folhas, não é preciso mexer no código —
  só se mudares os **nomes** das folhas (`Viagens`, `Viaturas`), que estão no
  topo de `Codigo.gs`.
