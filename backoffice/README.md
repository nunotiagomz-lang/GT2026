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

  **Saída da viatura** — na nova viagem indicas os **km no conta-quilómetros**
  e os **litros no depósito** à saída. Vão para o topo da folha de
  abastecimentos (por baixo do Trajecto, com as linhas de chegada ainda
  vazias) e para as colunas `Km Saída` / `Litros Saída` da folha `Viagens`
  (criadas no fim na primeira vez):

  ```
  Viagem          VF53
  Matrícula       ALM 226 MP
  Motorista       Cesar Timbana
  Trajecto        Matola, Maxixe
  Km Saída        89900
  Km Chegada
  Litros Saída    60
  Litros Chegada

  Data  Local  Bomba  Litros  Preço/Litro  Valor (MZN)  Km
  ```

  **Fechar viagem** (botão ao lado de *Nova viagem*) — no regresso escolhes a
  viagem e lanças a data, os **km** e os **litros à chegada** (os de saída vêm
  preenchidos e podem ser corrigidos). O formulário mostra a conta antes de
  gravar:

  - km da viagem = km chegada − km saída
  - litros consumidos = litros saída + litros abastecidos (soma da folha) − litros chegada
  - consumo = litros consumidos ÷ km (em **L/km** e L/100km)

  Grava os quatro valores no bloco da folha de abastecimentos (nas folhas
  antigas, acrescenta as linhas que faltem sem mexer nos abastecimentos) e na
  folha `Viagens`: `Km Chegada`, `Litros Chegada`, `Litros Consumidos`,
  `Consumo (L/km)` e o `Regresso`. A coluna `KM` só é preenchida se estiver
  vazia; se for diferente do conta-quilómetros, o formulário avisa. Recusa km
  de chegada abaixo dos de saída e litros que deem consumo zero ou negativo.
  Uma viagem já fechada pode ser fechada outra vez para corrigir.

  **Valor combinado** — o valor acordado com o cliente, na coluna **`Valor
  Rate`** da folha `Viagens` (também são reconhecidas `Valor Combinado`, `Rate`
  e `Tarifa`). Aparece logo a seguir ao Cliente, em destaque; os campos do
  motorista (diárias, adiantamentos, despesas, saldos) ficam numa secção
  dobrável no fim. Se a folha não tiver nenhuma destas colunas, a coluna
  `Valor Combinado (MZN)` é criada no fim na primeira viagem que o tiver. Os **recebimentos** lançados em
  Contas com o VF da viagem vão abatendo: a app mostra *Por receber → Parcial →
  Concluído*, com o pendente, e o formulário Contas mostra-o ao escolher a viagem
  num recebimento («combinado 50 000 · já recebido 20 000 · falta 30 000»).
- **Abastecimento** — escolhes a viagem e lanças data, **nome da bomba**, local,
  litros, preço e km. O valor total é calculado (litros × preço) e **aparece no
  ecrã enquanto escreves**, e a linha vai para a folha dessa viagem.

  **Como foi pago** é obrigatório, e decide onde o abastecimento é lançado:

  | Como foi pago | Livro geral | Livro dos investidores |
  |---|---|---|
  | Caixa da empresa / Banco | Despesa de combustível, Meio Caixa/Banco | — |
  | Por um sócio → **Adiantamento** | Despesa de combustível, Meio Sócio | `Despesa paga pelo sócio` — a empresa fica a dever-lhe (ou abate ao que ele levou) |
  | Por um sócio → **Investimento** | Despesa de combustível, Meio Sócio | `Investimento` — capital, conta para as quotas |

  Nos três casos o combustível é **despesa** da operação; o que muda é quem a
  financiou. Há ainda a caixa **Recibo entregue pelo motorista** (ver Recibos).

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
  sócio), viagem e nota. Escreve em `Movimentos Geral`.

  **Despesa paga do bolso de um sócio** (tipo `Despesa`, `Meio = Sócio`, e o
  sócio em `Pago Por`): o formulário pergunta como fica — **Adiantamento** (a
  empresa devolve-lhe, ou abate ao que ele levou) ou **Investimento** (capital) —
  e lança-a também no livro dos investidores, como no abastecimento.

  **Despesa de uma viagem que precisa de recibo** (combustível, manutenção,
  portagens, estadias, parqueamento): aparece a caixa *Recibo entregue pelo
  motorista*. As **diárias não têm recibo** e não a mostram.
- **Faturação** — regista a fatura **já emitida** (no livro ou no programa do
  contabilista) de **uma viagem**: escolhes a viagem (as já faturadas aparecem
  bloqueadas), e o cliente e o valor vêm preenchidos; escreves o **nº da
  fatura**; o vencimento é sugerido a 30 dias. Valores **sem IVA**.

  Grava na folha `Faturas` (criada na primeira vez) e põe o nº na coluna
  `Factura` da viagem. Recusa um nº já registado e uma segunda fatura para a
  mesma viagem. O estado (paga, parcial, vencida) é a app que calcula, pelos
  recebimentos com o VF.
- **Recibos** — a lista das despesas de viagens com o recibo **por entregar**,
  com o total. Quando o motorista entregar, carregas em **Entregue**. Antes de
  marcar, o formulário confere a linha (descrição e valor): se a folha tiver
  mudado entretanto, não toca em nada e pede para recarregar.

  O estado vai para a coluna **`Recibo`** do `Movimentos Geral` (`Entregue` /
  `Por entregar`), criada no fim da folha no primeiro lançamento que a precise.
  As linhas antigas ficam sem estado e não contam como pendentes.

- **Motorista** — o dinheiro que se adianta ao motorista para a viagem
  (portagens, despesas extras, diárias). Escolhes a viagem e vês logo a conta
  dele; depois um de três movimentos:

  | Movimento | Quando | O que grava |
  |---|---|---|
  | **Adiantamento** | no início, e sempre que mandares mais | `Adiantamento ao motorista`, Meio Caixa / Banco / Sócio. Se foi um sócio: **Adiantamento** (a empresa deve-lhe) ou **Investimento**, também no livro dos investidores |
  | **Despesa** | o que ele pagou: portagens, extras, diárias… | `Despesa`, **Meio = Motorista**. Tudo pede recibo **menos as diárias**; sem recibo fica *por justificar* (aparece em Recibos) |
  | **Devolução** | o que sobrou e ele devolveu | `Devolução do motorista`, Meio Caixa / Banco |

  O adiantamento **não é despesa** (o dinheiro só mudou de mão); a despesa é o
  que ele gasta. Na tesouraria, o adiantamento sai da Caixa/Banco e a devolução
  volta; as despesas com Meio Motorista já não voltam a sair (saíram no
  adiantamento).

  A conta é **adiantado − justificado − devolvido**: positivo, o motorista tem
  de justificar ou devolver; negativo, a empresa deve-lhe (gastou mais do que
  levou). Cada lançamento — e cada recibo marcado como entregue — atualiza
  sozinho as colunas da folha `Viagens`: `Adiantamento Total Motorista`,
  `Despesas Total Justificadas`, `Saldo Motorista`, `Devolvido Motorista`,
  `Saldo Final Motorista` e `Diárias`. **Células com fórmula não são tocadas.**

  No **Abastecimento** há também a opção *Pelo motorista, do adiantamento*:
  entra como despesa da viagem com Meio Motorista e abate à conta dele.
- **Sócios** (antes «Investimentos») — o dinheiro dos sócios. Tem os mesmos campos, mas em vez de
  um valor único tem **uma caixa por sócio**; o **total é a soma** dessas caixas
  e vai-se atualizando à medida que escreves.

  Escreve nas **duas** folhas: em `Movimentos dos Investidores` uma linha com o
  valor de cada sócio na coluna dele, e em `Movimentos Geral` uma linha com o
  **somatório**, já com `Meio = Sócio` e o `Pago Por` preenchido com os nomes de
  quem contribuiu. É assim que a conta corrente e a contabilidade ficam ambas
  certas com um só lançamento.

  Os tipos vêm em dois grupos:

  - **Capital** — `Investimento`, `Suprimento`, `Devolução de capital`,
    `Dividendo`. Os dois últimos são dinheiro que sai para o sócio, e a app
    desconta-os ao que ele tem investido.
  - **Adiantamentos e devoluções** — `Adiantamento do sócio`, `Devolução ao
    sócio`, `Adiantamento ao sócio`, `Devolução do sócio`. Dinheiro que tem de
    voltar; não mexe nas quotas.

  Nos adiantamentos, devoluções e dividendos o formulário pede **por onde passou
  o dinheiro na empresa** (Caixa ou Banco) — é o que os põe na tesouraria. Ao
  escolher um tipo de adiantamento, cada sócio mostra o **pendente** («a empresa
  deve-lhe 50 000» / «deve à empresa 5 000»), para saberes quanto devolver; uma
  devolução maior do que o pendente grava mas avisa.

  No primeiro lançamento que não seja investimento, o formulário acrescenta a
  coluna **`Tipo`** ao fim do livro dos investidores, se ainda não existir. Sem
  ela, um adiantamento ficaria igual a um investimento e entraria nas quotas.

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
