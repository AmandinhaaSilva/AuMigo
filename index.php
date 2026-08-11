<?php
session_start();

if(!isset($_SESSION['id'])){
    header("Location: entrar.html");
    exit();
}
?>

<!DOCTYPE html>
<html lang="pt-br">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

    <link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap"
        rel="stylesheet">

    <link rel="stylesheet" href="src/styles/style.css">
    <link rel="stylesheet" href="src/styles/header.css">
    <link rel="stylesheet" href="src/styles/home.css">

    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js"></script>

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

    <title>AuMigo</title>
</head>

<body>

    <?php include("header.php"); ?>

    <main id="content">
        <section id="home">
            <div id="cta">
                <h1 class="title">
                    Um novo lar começa com um gesto de
                    <span>Amor 🐾</span>
                </h1>

                <p class="description">
                    AuMigo: porque cada bicho merece um amigo de verdade!
                </p>

                <div id="cta_buttons">
                    <a href="doações.html" class="btn-default">
                        Faça uma doação
                    </a>

                    <a href="tel:+5517991529098" class="btn-default" id="phone_button">
                        <i class="fa-solid fa-phone"></i>
                        (17) 99152-9090
                    </a>


                </div>


            </div>

            <div id="banner">
                <img src="img/banner.png" alt="Banner">
            </div>


        </section>
    </main>

    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="src/javascript/script.js"></script>
    <script src="src/javascript/carrinho.js"></script>

</body>

</html>