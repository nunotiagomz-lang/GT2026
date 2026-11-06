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
  abastecimentos — já com a **identificação da viagem no topo**:

  ```
  Viagem      VF53
  Matrícula   AMQ-001-MP
  Motorista   Claúdio Mute
  Trajecto    MANICA - TETE

  Data  Bomba  Local  Litros  Preço/Litro  Valor (MZN)  Km
  ```

  Assim, quem abre a folha no telemóvel sabe logo de que viatura e de que
  percurso se trata, sem ter de ir à outra planilha.
- **Abastecimento** — escolhes a viagem e lanças data, **nome da bomba**, local,
  litros, preço, km, quem recebeu o pagamento e o meio. O valor total é
  calculado (litros × preço) e **aparece no ecrã enquanto escreves**, e a linha
  vai para a folha dessa viagem.

  Nos litros, no preço e em qualquer campo de valor podes escrever **casas
  decimais com vírgula** (`240,5`, `82,5`) ou com ponto — tanto faz. A bomba
  oferece as que já usaste antes, e serve depois para comparar preços por posto.

  O mesmo abastecimento entra **automaticamente** no `Movimentos Geral` como
  **despesa de combustível**, já ligada à viagem — o combustível é dinheiro que
  sai, e sem isto a tesouraria e as despesas ficavam abaixo do real. **Não o
  lances outra vez em Contas**, senão fica contado a dobrar.
- **Contas** — o livro geral da empresa. Data, **tipo** (Despesa / Recebimento /
  Investimento / Suprimento), **categoria**, descrição, valor, **Pago Por**
  (um sócio, a empresa, ou um fornecedor / cliente), meio (caixa / banco /
  sócio), viagem e nota. Escreve **apenas** em `Movimentos Geral`.

- **Investimentos** — o dinheiro dos sócios. Tem os mesmos campos, mas em vez de
  um valor único tem **uma caixa por sócio**; o **total é a soma** dessas caixas
  e vai-se atualizando à medida que escreves.

  Escreve nas **duas** folhas: em `Movimentos dos Investidores` uma linha com o
  valor de cada sócio na coluna dele, e em `Movimentos Geral` uma linha com o
  **somatório**, já com `Meio = Sócio` e o `Pago Por` preenchido com os nomes de
  quem contribuiu. É assim que a conta corrente e a contabilidade ficam ambas
  certas com um só lançamento.

  Os tipos aqui são `Investimento`, `Suprimento`, `Devolução` e `Dividendo` — os
  dois últimos são dinheiro que sai para o sócio, e a app desconta-os ao que ele
  tem investido.

## Instalação (uma vez, ~5 minutos)

Faz isto **no computador** — copiar código no telemóvel é penoso.

1. Abre o `CNET LOGISTICS MGMT` no Google Sheets → menu **Extensões → Apps
   Script**. (Assim o projeto fica agarrado ao ficheiro e voltas lá sempre por
   este caminho.) Renomeia o projeto para `CNET Logistics — Back office`.
2. Apaga o que estiver no `Código.gs` e cola o conteúdo de
   [`Codigo.gs`](https://raw.githubusercontent.com/nunotiagomz-lang/GT2026/main/backoffice/Codigo.gs).
3. **+ (Ficheiros) → HTML**, dá-lhe o nome **`Formulario`** (sem acento, tal
   como está no código) e cola o conteúdo de
   [`Formulario.html`](https://raw.githubusercontent.com/nunotiagomz-lang/GT2026/main/backoffice/Formulario.html).
4. Confirma no topo de `Codigo.gs` os IDs dos ficheiros e a lista
   `EMAILS_AUTORIZADOS` — acrescenta os emails dos sócios que podem lançar dados.
5. **Implementar → Nova implementação → Aplicação Web**:
   - *Executar como*: **Eu**
   - *Quem tem acesso*: **Qualquer pessoa com uma Conta Google**
     (o código só deixa passar os emails autorizados)
6. Autoriza quando o Google pedir (avisa que a app "não é verificada" — é
   normal, é tua: **Avançadas → Aceder a…**) e guarda o link que aparece no fim.

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
- As folhas de abastecimentos **antigas** (criadas antes do bloco de título)
  continuam a funcionar como estavam. Para lhes acrescentar a matrícula, o
  motorista e o trajecto de uma só vez: no editor do Apps Script, escolher a
  função **`preencherTitulosDasViagens`** na lista ao lado do botão Executar e
  correr uma vez. Só mexe nas folhas cujo nome é um código VF, salta as que já
  têm o bloco, e os abastecimentos já lançados ficam intactos (descem quatro
  linhas). Pode-se repetir sem risco.
- O abastecimento é escrito **pelo nome da coluna**, não pela posição: uma folha
  antiga sem a coluna `Bomba` recebe os valores nas colunas certas, e podes
  acrescentar-lhe a coluna quando quiseres.
