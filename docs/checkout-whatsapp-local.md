# Finalização local pelo WhatsApp (T17)

T17 transforma o resumo do carrinho em uma mensagem para o WhatsApp sem criar pedido, pagamento ou conta. O fluxo continua restrito ao projeto fictício `demo-aufriends-local` e usa os produtos ativos e preços atuais lidos do Firestore.

## Configuração pública

A página lê somente `siteSettings/public` depois de conectar ao Firestore Emulator. Para liberar o botão, o documento precisa conter:

- `whatsappDigits`: destino normalizado para 10 a 15 dígitos;
- `whatsappGreeting`: saudação não vazia com até 300 caracteres.

Na fixture local aceita, o destino fictício é `5517991529090` e a saudação é `Olá! Quero finalizar meu pedido com a equipe AuFriends.`. A administração dessa configuração permanece no painel protegido.

## Fluxo do carrinho

`/carrinho` reconcilia primeiro os IDs locais com o catálogo público (`active == true`) e usa apenas os preços correntes em centavos. A página mostra a mensagem exata antes da abertura. O formato é:

```text
<saudação>

Pedido AuFriends:
- <produto> — <quantidade> × <valor unitário> = <subtotal>

Total: <total>

Quero combinar a entrega e o pagamento via Pix com a equipe AuFriends.
```

O destino é montado como `https://wa.me/<dígitos>?text=<mensagem codificada>`. Uma janela vazia é solicitada somente dentro do clique explícito e recebe o destino depois da validação. Se o navegador bloquear o pop-up, a página orienta a liberação em uma região acessível. Carrinho vazio, configuração ausente/inválida e produto indisponível mantêm o botão bloqueado e nunca abrem uma URL.

A abertura não altera a chave `aufriends.cart.v1`: nenhum item é removido, nenhuma quantidade muda e o carrinho não é esvaziado.

## Verificação local

Com Auth, Firestore e Hosting Emulator já ativos nas portas oficiais e as fixtures aceitas presentes:

```powershell
npm run build
npm run verify:t17
npm run verify:t11
npm run verify:panel
```

`verify:t17` não grava documentos ou mídias. Os 12 cenários verificam configuração pública, normalização, mensagem/URL exatas, centavos, produtos ativos, reconciliação, carrinho vazio, destino inválido, abertura permitida/bloqueada, preservação do carrinho, integração acessível e estado final das fixtures.

## Limites

Não há documento de pedido, reserva de estoque, checkout, gateway, QR Code, chave Pix, comprovante ou processamento de pagamento. Entrega e Pix são apenas combinados diretamente no WhatsApp. Produção, projeto Firebase remoto e publicação continuam fora do escopo.
