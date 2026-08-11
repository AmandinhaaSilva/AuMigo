<?php

require_once("../../conexao.php");

$sql = "SELECT id, nome, email, telefone, tipo_usuario, data_cadastro
        FROM usuarios
        ORDER BY id DESC";

$resultado = $conn->query($sql);

if (!$resultado) {
    die("Erro ao buscar usuários: " . $conn->error);
}

?>

<h1 class="titulo">👥 Usuários</h1>

<br>

<table class="tabela">

    <tr>
        <th>ID</th>
        <th>Nome</th>
        <th>E-mail</th>
        <th>Telefone</th>
        <th>Tipo</th>
        <th>Data de Cadastro</th>
    </tr>

    <?php while ($usuario = $resultado->fetch_assoc()) { ?>

        <tr>

            <td>
                <?= htmlspecialchars($usuario["id"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($usuario["nome"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($usuario["email"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($usuario["telefone"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($usuario["tipo_usuario"]) ?>
            </td>

            <td>
                <?= date("d/m/Y H:i", strtotime($usuario["data_cadastro"])) ?>
            </td>

        </tr>

    <?php } ?>

</table>