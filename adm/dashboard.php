<?php
require_once("includes/verifica_login.php");
?>

<?php include("includes/header.php"); ?>

<?php include("includes/menu.php"); ?>

<div class="content">

    <h1 class="titulo">Dashboard</h1>

    <h2>Olá, <?php echo $_SESSION["admin_nome"]; ?> 👋</h2>

    <br>

    <div class="cards">

        <div class="card">
            <h3>🐶 Animais</h3>
            <p>0</p>
        </div>

        <div class="card">
            <h3>🛒 Produtos</h3>
            <p>0</p>
        </div>

        <div class="card">
            <h3>👥 Usuários</h3>
            <p>0</p>
        </div>

        <div class="card">
            <h3>❤️ Doações</h3>
            <p>0</p>
        </div>

    </div>

</div>

<?php include("includes/footer.php"); ?>