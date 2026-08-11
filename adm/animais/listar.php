<?php

require_once("../../conexao.php");

$sql = "SELECT * FROM animais ORDER BY id DESC";

$resultado = $conn->query($sql);

if (!$resultado) {
    die("Erro ao buscar animais: " . $conn->error);
}

?>

<h1 class="titulo">🐶 Animais</h1>

<a href="adicionar.php" class="btn">+ Novo Animal</a>

<br><br>

<table class="tabela">

    <tr>
        <th>Foto</th>
        <th>Nome</th>
        <th>Espécie</th>
        <th>Raça</th>
        <th>Status</th>
        <th>Ações</th>
    </tr>

    <?php while ($animal = $resultado->fetch_assoc()) { ?>

        <tr>

            <td>

                <?php if (!empty($animal["foto"])) { ?>

    <img
    src="../../img/<?= htmlspecialchars($animal["foto"]) ?>"
    alt="<?= htmlspecialchars($animal["nome"]) ?>"
    width="80"
    height="80"
    style="object-fit: cover; border-radius: 10px;"
    >

                <?php } else { ?>

                    Sem foto

                <?php } ?>

            </td>

            <td>
                <?= htmlspecialchars($animal["nome"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($animal["especie"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($animal["raca"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($animal["status_adocao"]) ?>
            </td>

            <td>

                <a href="editar.php?id=<?= $animal["id"] ?>">
                    ✏ Editar
                </a>

                |

                <a
                    href="excluir.php?id=<?= $animal["id"] ?>"
                    onclick="return confirm('Tem certeza que deseja excluir este animal?');"
                >
                    🗑 Excluir
                </a>

            </td>

        </tr>

    <?php } ?>

</table>