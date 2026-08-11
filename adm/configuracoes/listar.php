<?php

require_once("../../conexao.php");

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION["admin_id"])) {
    header("Location: ../login.php");
    exit();
}

?>

<h1 class="titulo">⚙ Configurações</h1>

<br>

<div class="card">

    <h2>⚙ Configurações do AuMigo</h2>

    <p>
        Nesta área você poderá gerenciar as configurações
        do painel administrativo.
    </p>

</div>

<br>

<div class="cards">

    <div class="card">

        <h3>👤 Administrador</h3>

        <p>
            Nome:
            <?= htmlspecialchars($_SESSION["admin_nome"]) ?>
        </p>

        <a href="#" class="btn">
            Editar perfil
        </a>

    </div>


    <div class="card">

        <h3>🔐 Segurança</h3>

        <p>
            Gerencie as informações de acesso
            do painel administrativo.
        </p>

        <a href="#" class="btn">
            Alterar senha
        </a>

    </div>


    <div class="card">

        <h3>🐾 AuMigo</h3>

        <p>
            Sistema de gerenciamento da plataforma
            AuMigo.
        </p>

    </div>

</div>