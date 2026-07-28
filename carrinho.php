<!DOCTYPE html>
<html lang="pt-BR">

<head>
    <meta charset="UTF-8">
    <title>Carrinho AuMigo</title>
    <link rel="stylesheet" href="carrinho.css">
</head>

<body>

    <section class="carrinho-container">
        <img src="img/logo.png" alt="AuMigo" class="logo-carrinho">

        <h1>Meu Carrinho 🐾</h1>
        <p class="subtitulo">Confira seus produtos e ajude nossos doguinhos 💗</p>

        <div id="listaCarrinho"></div>

        <div class="total-box">
            <h2>Total: R$ <span id="totalCarrinho">0,00</span></h2>
            <button onclick="finalizarCompra()">Finalizar Compra</button>
        </div>

        <div id="listaCarrinho"></div>

        <h2>Total: R$ <span id="totalCarrinho">0,00</span></h2>

    </section>

    <script src="carrinho.js"></script>
</body>

</html>