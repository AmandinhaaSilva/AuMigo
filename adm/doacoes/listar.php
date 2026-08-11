<?php

require_once("../../conexao.php");

$sql = "SELECT * FROM doacoes ORDER BY id DESC";

$resultado = $conn->query($sql);

if (!$resultado) {
    die("Erro ao buscar doações: " . $conn->error);
}

?>

<h1 class="titulo">❤️ Doações</h1>

<br>

<table class="tabela">

    <tr>
        <th>ID</th>
        <th>Doador</th>
        <th>E-mail</th>
        <th>Telefone</th>
        <th>Tipo</th>
        <th>Descrição</th>
        <th>Valor</th>
        <th>Data</th>
    </tr>

    <?php while ($doacao = $resultado->fetch_assoc()) { ?>

        <tr>

            <td>
                <?= htmlspecialchars($doacao["id"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($doacao["nome_doador"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($doacao["email"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($doacao["telefone"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($doacao["tipo_doacao"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($doacao["descricao"]) ?>
            </td>

            <td>
                R$ <?= number_format($doacao["valor"], 2, ",", ".") ?>
            </td>

            <td>
                <?= date("d/m/Y H:i", strtotime($doacao["data_doacao"])) ?>
            </td>

        </tr>

    <?php } ?>

</table>