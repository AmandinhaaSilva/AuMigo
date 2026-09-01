<!DOCTYPE html>
<html lang="pt-BR">

<head>
    <meta charset="UTF-8">
    <title>Meu Carrinho | AuMigo</title>

    <link rel="stylesheet" href="src/styles/carrinho.css">

    <link rel="stylesheet"
    href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

</head>

<body>

<div class="fundo">

<div class="carrinho-container">

<img src="logo.png" class="logo-carrinho">

<h1>Meu Carrinho</h1>

<p class="subtitulo">
Confira seus produtos antes de finalizar sua compra 🐾
</p>

<hr>

<div id="listaCarrinho"></div>

<div class="resumo">

<div class="total-box">

<span>Total</span>

<h2>

R$
<span id="totalCarrinho">0,00</span>

</h2>

</div>

<button onclick="finalizarCompra()">

<i class="fa-solid fa-credit-card"></i>

Finalizar Compra

</button>

<a href="loja.php" class="voltar">

← Continuar comprando

</a>

</div>

</div>

</div>

<script src="src/javascript/carrinho.js"></script>

</body>
</html>