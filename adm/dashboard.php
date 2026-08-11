<?php
require_once("includes/verifica_login.php");
?>

<?php include("includes/header.php"); ?>

<?php include("includes/menu.php"); ?>

<div class="content">

    <?php

if (!isset($_SESSION["admin_id"])) {
    header("Location: login.php");
    exit();
}

require_once("../conexao.php");

$sql_animais = "SELECT COUNT(*) AS total FROM animais";
$resultado_animais = $conn->query($sql_animais);
$dados_animais = $resultado_animais->fetch_assoc();

$total_animais = $dados_animais["total"];

?>

<h1 class="titulo">Dashboard</h1>

<h2>Olá, <?php echo $_SESSION["admin_nome"]; ?> 👋</h2>

<br>

<div class="cards">

    <div class="card">
        <h3>🐶 Animais</h3>
        <p><?php echo $total_animais; ?></p>
    </div>

   <div class="card">
    <h3>🛒 Produtos</h3>
    <p>
        <?php
        $sql_produtos = "SELECT COUNT(*) AS total FROM produtos";
        $resultado_produtos = $conn->query($sql_produtos);
        $dados_produtos = $resultado_produtos->fetch_assoc();

        echo $dados_produtos["total"];
        ?>
    </p>
    </div>
    
    <div class="card">
    <h3>👥 Usuários</h3>
    <p>
        <?php
        $sql_usuarios = "SELECT COUNT(*) AS total FROM usuarios";
        $resultado_usuarios = $conn->query($sql_usuarios);
        $dados_usuarios = $resultado_usuarios->fetch_assoc();

        echo $dados_usuarios["total"];
        ?>
    </p>
    </div>

    <div class="card">
    <h3>❤️ Doações</h3>
    <p>
        <?php
        $sql_doacoes = "SELECT COUNT(*) AS total FROM doacoes";
        $resultado_doacoes = $conn->query($sql_doacoes);
        $dados_doacoes = $resultado_doacoes->fetch_assoc();

        echo $dados_doacoes["total"];
        ?>
    </p>
    </div>

</div>

<?php include("includes/footer.php"); ?>