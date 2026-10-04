# Produtos e carrinho locais (T11)

T11 conecta a loja ao Firestore/Storage do projeto fictício `demo-aufriends-local` e mantém o carrinho exclusivamente no navegador. Visitantes não criam conta e não escrevem documentos de produto.

## Preparar o catálogo

Com Auth, Firestore e Storage Emulator já ativos nos ports oficiais:

```powershell
npm run fixtures:auth
npm run fixtures:products
npm run verify:t11
```

`fixtures:products` é local e idempotente. O script recusa projeto, hosts ou credenciais externas e cria/atualiza somente estes sete IDs:

- `t11-racao-premium`;
- `t11-brinquedo-mordedor`;
- `t11-coleira-ajustavel`;
- `t11-shampoo-pet`;
- `t11-caminha-fofinha`;
- `t11-petisco-natural`;
- `t11-roupinha`.

Os nomes, descrições, preços, comparativos, selos e imagens vêm da vitrine visual recebida. Cada produto usa caminho de mídia fixo e seguro sob `public/products/{productId}/`. A fixture não lê SQL nem altera animais, solicitações de adoção, doações ou `siteSettings/public`.

Rotas locais:

- catálogo: `http://127.0.0.1:5000/loja`;
- carrinho: `http://127.0.0.1:5000/carrinho`;
- painel protegido: `http://127.0.0.1:5000/admin/painel#produtos`.

## Catálogo público

A consulta pública exige `active == true` e ordena por `sortOrder`. Categoria e faixa de preço são filtros locais aplicados somente depois da consulta autorizada:

- até R$ 30,00: `priceCents <= 3000`;
- de R$ 30,01 a R$ 80,00: `3001 <= priceCents <= 8000`;
- acima de R$ 80,00: `priceCents > 8000`.

Valores são calculados como inteiros e formatados em `pt-BR`. O preço comparativo aparece somente quando é um inteiro válido e maior que `priceCents`. Não existe parcelamento calculado ou exibido.

## Carrinho no navegador

A chave `aufriends.cart.v1` contém diretamente uma lista JSON e persiste somente os identificadores e quantidades:

```json
[
  { "productId": "t11-racao-premium", "quantity": 2 }
]
```

Nome, preço, imagem e descrição nunca são armazenados no carrinho. Leituras saneiam JSON corrompido, campos extras, IDs inválidos, duplicatas e quantidades fora do intervalo inteiro de 1 a 99. Mudanças em uma página emitem `aufriends:cart-changed`; outras abas recebem o evento `storage`.

A página do carrinho consulta novamente todos os produtos ativos e calcula o total com os preços correntes. IDs ausentes ou inativos são removidos com aviso acessível antes da soma. Se o catálogo falhar, nenhum total baseado em cache é exibido.

T11 entregou o botão de finalização desabilitado. T17 passou a montar uma mensagem e abrir `wa.me` por ação explícita, sem alterar a persistência ou os cálculos deste carrinho. O contrato atual e seus limites estão em `docs/checkout-whatsapp-local.md`; ainda não existe pedido, estoque, gateway ou processamento de pagamento.

## Administração e mídia

O módulo é importado somente após a guarda confirmar um administrador ativo. O painel lista itens ativos e inativos e permite criar, editar, ativar, desativar e excluir produtos. Entradas monetárias aceitam reais sem separador de milhar e com no máximo duas casas decimais.

Uploads aceitam JPEG, PNG ou WebP de até 5 MiB. No navegador, a imagem é convertida para WebP e limitada a 1600 px na maior dimensão. Na substituição, a ordem é upload novo, gravação integral do documento e remoção da mídia antiga. Se a gravação falhar, o upload novo é removido quando possível; qualquer caminho órfão é mostrado no aviso administrativo.

## Verificação

`npm run verify:t11` usa somente os emuladores em loopback. Os 17 cenários cobrem normalização, faixas, comparativo, fixture, consulta pública, permissões, CRUD, mídia, carrinho, eventos, totais, itens indisponíveis, integração do ponto de finalização, preservação e limpeza.

A suíte de Rules 21/21 não deve ser repetida durante T11 porque limpa o estado compartilhado. A evidência existente continua válida, pois `firestore.rules`, `storage.rules` e índices não mudaram. A inspeção visual desktop/celular permanece com o Orquestrador.
