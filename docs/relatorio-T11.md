# Relatório T11 — Produtos, catálogo e carrinho local

## Estado e versão

T11 foi implementada e autoverificada sobre `24d2fef574cc8b40658e49ed0b1876467191933c` mais o workspace local final de T10. As correções aceitas de T09/T10 foram preservadas. Não houve commit, deploy, login em projeto remoto, reinício ou encerramento de serviço, edição da nota central ou contato com terminal Codex genérico.

O Orquestrador repetiu as suítes automatizadas e executou a validação funcional no Portal Maestri sobre o Hosting Emulator. O aceite abaixo corresponde ao workspace final, após remover o produto e a mídia temporários do teste.

## Resultado funcional

- `/loja` consulta somente `products` ativos por `sortOrder`, resolve imagens no Storage e possui estados acessíveis de carregamento, vazio e erro.
- Categoria e preço são filtrados no cliente com as fronteiras `<= 3000`, `3001..8000` e `> 8000`; todos os valores usam centavos inteiros e formatação BRL.
- Preço comparativo só aparece quando é inteiro válido e maior que o preço atual. Parcelamento não foi criado.
- Comprar adiciona ou incrementa até 99, atualiza a confirmação e o badge global.
- `aufriends.cart.v1` persiste somente uma lista de `{productId, quantity}`, saneia corrupção/duplicatas e sincroniza no documento e entre abas.
- `/carrinho` recarrega os produtos ativos, usa preços atuais, remove IDs ausentes/inativos antes da soma e permite incrementar, reduzir, definir, remover e esvaziar mediante confirmação.
- A finalização permanece desabilitada para T17 e não limpa o carrinho. Nenhum pedido, estoque, pagamento, Pix, link `wa.me`, mensagem de WhatsApp ou conta pública foi criado.
- O painel, carregado somente após a guarda, lista ativos/inativos e permite CRUD, ativação e mídia com a ordem upload novo → documento → remoção anterior. A imagem é limitada a 1600 px e validada em JPEG/PNG/WebP de até 5 MiB.
- A fixture idempotente mantém os sete produtos e sete mídias do baseline, sem alterar outras coleções.

## Arquivos T11

- `web/loja/index.html`
- `web/carrinho/index.html`
- `web/admin/painel/index.html`
- `web/src/components/site-shell.js`
- `web/src/features/products-catalog.js`
- `web/src/features/cart-page.js`
- `web/src/features/admin-products.js`
- `web/src/features/admin-panel.js`
- `web/src/services/products-data.js`
- `web/src/services/cart-store.js`
- `web/src/styles/site.css`
- `scripts/fixtures/products-t11.mjs`
- `scripts/verify-products-cart.mjs`
- `scripts/verify-admin-panel.mjs`
- `package.json`
- `docs/produtos-carrinho-local.md`
- `docs/relatorio-T11.md`
- `README.md`

`scripts/verify-admin-panel.mjs` recebeu apenas a integração necessária: a expectativa estática do antigo link `#proximos-modulos` foi substituída por `#produtos`. `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `package-lock.json` e os assets do baseline não foram alterados em T11.

## Comandos e resultados

| Comando/verificação | Resultado final |
| --- | --- |
| `npm run fixtures:products` | PASSOU duas vezes; sete IDs/mídias, sem duplicação |
| `npm run verify:t11` | PASSOU; 17/17 cenários, 0 falhos, limpeza concluída |
| `npm run build` | PASSOU; Vite 8.3.2, 54 módulos transformados |
| `npm run verify:t09` | PASSOU; 18/18 cenários, 0 falhos |
| `npm run verify:t10` | PASSOU; 14/14 cenários, 0 falhos |
| `npm run verify:auth` | PASSOU; 7/7 cenários |
| `npm run verify:panel` | primeira execução 9/10 por expectativa estática obsoleta; após ajuste T11, PASSOU 10/10 |
| `node --check` nos módulos/scripts afetados | PASSOU; 10/10 |
| parse de `package.json`, lock, `firebase.json` e índices | PASSOU; 4/4 JSON válidos |
| `npm ls --depth=0` | PASSOU; árvore instalada consistente |
| UTF-8 e whitespace do escopo T11 | PASSOU; 17/17 arquivos então existentes |
| `git diff --check` | PASSOU; sem erro; somente aviso LF/CRLF do README |
| varredura do código de produção por segredos, destinos remotos e escopo T17 | PASSOU; nenhuma ocorrência |
| HTTP pelo Hosting Emulator | PASSOU; `/loja`, `/carrinho` e `/admin/painel` responderam 200 com os marcadores funcionais |
| Portal Maestri desktop 1440×900 | PASSOU; catálogo, filtros, carrinho, login, CRUD/mídia, desativação, reconciliação e exclusão |
| Portal Maestri celular 390×844 | PASSOU; loja, carrinho e painel sem overflow horizontal; sete imagens carregadas ao percorrer o catálogo |
| Console do navegador | PASSOU; nenhum log ou erro nas recargas de loja, carrinho e painel |

Os `PERMISSION_DENIED` dos verificadores correspondem aos cenários negativos esperados. A suíte de Rules não foi repetida porque limpa o estado compartilhado; a evidência vigente é 21/21 e os arquivos de regras/índices não mudaram.

## Revisão funcional do Orquestrador

- O catálogo carregou os sete produtos ativos, todas as mídias e os filtros combinados: Ração retornou 1 item, até R$ 30,00 retornou 3 e a combinação retornou vazio com mensagem acessível.
- Comprar duas unidades de Ração Premium e uma de Petisco Natural gravou exatamente os dois IDs e quantidades em `aufriends.cart.v1`, atualizou o badge para 3 e produziu total de R$ 196,70.
- Incrementar a ração atualizou quantidade/badge para 3/4 e total para R$ 286,60; reduzir, remover o petisco e recarregar preservou 2 unidades e R$ 179,80.
- O botão de finalização permaneceu desabilitado, identificado como entrega T17 e sem link de WhatsApp, Pix ou checkout antecipado.
- Pelo painel real, foi criado um produto ativo com preço R$ 12,34, comparativo R$ 15,00 e PNG gerado no navegador. O cliente converteu a imagem para WebP, o catálogo passou a 8 itens e a mídia carregou com o texto alternativo informado.
- A edição alterou nome e preço para R$ 13,21, removeu o comparativo e preservou a imagem; a desativação reduziu o catálogo público para 7. Ao abrir o carrinho, o item inativo foi removido antes do total com aviso explícito.
- A exclusão administrativa removeu o documento e a mídia temporários, e o indicador voltou a 7. A confirmação nativa de esvaziar o carrinho foi aceita na janela do Maestri; uma segunda aba confirmou `[]`, badge 0 e carrinho vazio.
- Em 390×844, loja, carrinho vazio e formulário/lista de produtos do painel ficaram sem overflow horizontal. Após percorrer o catálogo, as sete imagens estavam completas e com largura natural maior que zero.
- Reexecução final: T11 17/17, T09 18/18, T10 14/14, Auth 7/7 e painel 10/10; `git diff --check` sem erro, somente o aviso conhecido LF/CRLF do README.

Hashes preservados desde a entrada:

- `firestore.rules`: `65c02ca639c317a69315794b65158a3ee2193362`;
- `storage.rules`: `89d886311e40cce1936ad5ba3472568ddc04f437`;
- `firestore.indexes.json`: `014d89fdc0f24ceb23aabd59e0109bb1d228be03`;
- `package-lock.json`: `282d092dae9bf566ba41dfab4eba75a5859910e7`;
- correção do reset T09: `588e1def511441183c7922a2db6f94b4a8c4b4ad`;
- serviço de doações T10: `1bcc01630cfe1778f237cb32174bc901ab5b3c24`.

## Denominador T11 (17 cenários)

1. normalização estrita de moeda, campos, MIME, tamanho e caminho de otimização;
2. filtros nas quatro fronteiras e comparativo apenas quando maior;
3. sanitização de corrupção, duplicatas, campos extras e limite 99;
4. adicionar, incrementar, reduzir, definir, remover, esvaziar e emitir eventos;
5. sincronização por evento `storage` entre abas;
6. totais em centavos e reconciliação de indisponíveis antes da soma;
7. HTML/badge/painel e limites de T17;
8. sete documentos e sete mídias fixas fiéis ao baseline;
9. criação administrativa de documento e mídia;
10. leitura pública de mídia e consulta ativa/ordenada;
11. produto inativo oculto e reativação;
12. usuário autenticado não administrador negado no Firestore/Storage;
13. edição administrativa com `createdAt` imutável;
14. substituição segura e limpeza da mídia anterior;
15. exclusão de documento e mídia;
16. preservação de produtos fixos, T09, T10 e saudação UTF-8;
17. limpeza final de documento e mídias efêmeros.

## Estado final e serviços

- 7 produtos fixos ativos e 7 mídias de produto;
- 3 animais fixos e 3 mídias T09;
- 0 solicitações de adoção e 0 doações;
- `siteSettings/public` preservado com a saudação correta;
- nenhum pedido ou produto/mídia temporário restante.

Os serviços permaneceram ativos em loopback: UI `4000`, Hub `4400`, Hosting `5000`, Firestore `8080`, Auth `9099` e Storage `9199`.

## Riscos e limitações

- A otimização real por canvas/`createImageBitmap` é específica do navegador e foi exercitada no Portal com um PNG de 80×80 convertido para WebP; imagens maiores continuam cobertas pelo contrato automatizado de limite e redimensionamento.
- Se o navegador bloquear `localStorage`, o fallback mantém o carrinho somente na memória da página e não oferece persistência entre recargas/abas.
- O catálogo é atualizado ao carregar/repetir a página; não há listener em tempo real, estoque ou reserva transacional.
- O chunk compartilhado Firebase permanece em 572,24 kB minificado e gera o aviso já conhecido acima de 500 kB.
- O risco de `npm audit` já documentado foi preservado; nenhum `audit fix --force` foi executado.
