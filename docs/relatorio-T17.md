# Relatório T17 — finalização do carrinho pelo WhatsApp

Data local: 03/10/2026

Projeto: `demo-aufriends-local`

Base: workspace T11 aceito, sobre `24d2fef574cc8b40658e49ed0b1876467191933c`

## Estado

Implementação concluída, autoverificada e aceita pelo Orquestrador no Portal Maestri. `/carrinho` lê `siteSettings/public`, reconcilia o carrinho com produtos ativos e preços atuais, exibe a mensagem integral e abre somente uma URL validada em `https://wa.me/` após clique explícito. A ação não altera `aufriends.cart.v1`.

Não houve acesso a Firebase remoto, publicação, commit, reinício ou encerramento de processos. Rules, índices e `package-lock.json` permaneceram inalterados.

## Decisões

- O resumo visível e a mensagem usam o mesmo modelo calculado em centavos inteiros; nomes são reduzidos a uma linha e valores usam `pt-BR`.
- A prévia mostra exatamente o conteúdo colocado no parâmetro `text`. O verificador compara também o valor decodificado da URL.
- O destino aceita normalização de sinais usuais de telefone, exige 10 a 15 dígitos e fixa protocolo/host em `https://wa.me`.
- A janela `about:blank` é solicitada sincronamente dentro do clique, tem `opener` removido e só então recebe a URL já validada. Retorno nulo, exceção e falha síncrona de navegação geram estado acessível.
- Carrinho vazio, documento ausente, `schemaVersion` incompatível, telefone/saudação inválidos ou produto indisponível mantêm a ação bloqueada.
- A asserção histórica de `verify:t11` que exigia ausência de T17 foi substituída por uma regressão da fundação T11; o denominador permaneceu 17.

## Arquivos

- `web/carrinho/index.html`
- `web/src/features/cart-page.js`
- `web/src/services/whatsapp-checkout.js`
- `web/src/styles/site.css`
- `scripts/verify-whatsapp-checkout.mjs`
- `scripts/verify-products-cart.mjs`
- `package.json`
- `README.md`
- `docs/checkout-whatsapp-local.md`
- `docs/produtos-carrinho-local.md`
- `docs/relatorio-T17.md`

## Verificações executadas

| Comando | Resultado |
| --- | --- |
| `npm run build` | PASSOU; Vite 8.3.2, 55 módulos transformados |
| `npm run verify:t17` | PASSOU; 12/12, 0 falhos |
| `npm run verify:t11` | PASSOU; 17/17, 0 falhos; produto e mídias efêmeros removidos |
| `npm run verify:panel` | PASSOU; 10/10; `siteSettings/public` restaurado |
| validação JSON, whitespace e `git diff --check` | PASSOU |
| hashes de Rules, índices e lock | PASSOU; iguais à entrada |
| varredura de credenciais/destinos Firebase | PASSOU; somente bucket fictício local preexistente no verificador T11 |
| Portal Maestri desktop 1440×900 | PASSOU; resumo, abertura capturada, bloqueio de pop-up, recálculo, carrinho vazio e console |
| Portal Maestri celular 390×844 | PASSOU; itens, resumo, ação e orientações sem overflow horizontal nem imagem quebrada |

Hashes protegidos ao final:

```text
firestore.rules          65c02ca639c317a69315794b65158a3ee2193362
storage.rules            89d886311e40cce1936ad5ba3472568ddc04f437
firestore.indexes.json   014d89fdc0f24ceb23aabd59e0109bb1d228be03
package-lock.json        282d092dae9bf566ba41dfab4eba75a5859910e7
```

Os registros `PERMISSION_DENIED` de `verify:t11` são esperados nos cenários negativos de não administrador e imutabilidade de `createdAt`.

## Revisão funcional do Orquestrador

- Com 2 unidades de Ração Premium e 1 de Petisco Natural, a tela mostrou R$ 179,80, R$ 16,90 e total R$ 196,70; badge e armazenamento permaneceram em 3 itens.
- A prévia exibiu a saudação pública, as duas linhas com quantidade, valor unitário e subtotal, o total de R$ 196,70 e a orientação para combinar entrega e Pix.
- A abertura foi interceptada no próprio navegador: uma única chamada criou `about:blank`, recebeu `https://wa.me/5517991529090` e o parâmetro `text` decodificou exatamente para a prévia da tela.
- Após a abertura simulada, `aufriends.cart.v1`, badge e total permaneceram inalterados e o estado informou que o carrinho foi mantido.
- Com `window.open` retornando `null`, a página exibiu alerta acessível para permitir pop-ups, fez somente uma tentativa e preservou os itens e valores.
- Alterar o Petisco Natural de 1 para 2 atualizou, na mesma renderização, subtotal para R$ 33,80, total e mensagem para R$ 213,60.
- Remover os dois produtos deixou total R$ 0,00, badge 0, `[]`, prévia oculta e botão desabilitado com orientação explícita para adicionar um produto.
- A versão móvel em 390×844 foi percorrida até o rodapé; imagens carregaram, texto e botões permaneceram legíveis e não houve overflow horizontal. O console ficou vazio após recarga e alterações de quantidade.
- Ao final, o carrinho local foi limpo e os Portais desktop e móvel foram deixados na página inicial; o Firestore/Storage permaneceu no estado fixo registrado abaixo.

## Dados e serviços

T17 não grava dados. As regressões criaram somente registros/mídias temporários próprios e confirmaram a limpeza/restauração. Estado observado ao final: 7 produtos fixos, 7 mídias de produto, 3 animais, 0 solicitações de adoção, 0 doações e `siteSettings/public` preservado com saudação UTF-8.

Permaneceram ativos, sem intervenção: UI `:4000`, Hub `:4400`, Logging `:4500`, Hosting `:5000`, Firestore `:8080`, Auth `:9099` e Storage `:9199`, todos em `127.0.0.1`.

## Riscos e limitações

- A integração de janela e o resultado visual foram validados no Portal por interceptação determinística de `window.open`; o serviço externo do WhatsApp não foi acessado nem recebeu mensagem durante o teste local.
- Um bloqueio assíncrono imposto depois que o navegador aceitou a janela depende da mensagem do próprio navegador/WhatsApp.
- O build mantém o aviso já existente de chunk Firebase acima de 500 kB; não houve nova dependência nem alteração de lock.
- O fluxo apenas prepara a conversa. Pedido, estoque, conta, gateway, QR Code, chave/comprovante Pix e pagamento continuam inexistentes.
