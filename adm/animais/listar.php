<?php

require_once("../../conexao.php");

$sql = "SELECT * FROM animais ORDER BY id DESC";

$resultado = $conn->query($sql);

if (!$resultado) {
    die("Erro ao buscar animais: " . $conn->error);
}

?>

<div class="pagina-animais">

    <div class="cabecalho-pagina">

        <div>
            <h1 class="titulo">🐶 Animais</h1>
            <p class="subtitulo">
                Gerencie os animais cadastrados no AuMigo
            </p>
        </div>

        <a href="adicionar.php" class="btn">
            + Novo Animal
        </a>

    </div>

    <div class="tabela-container">

        <table class="tabela">

            <thead>
                <tr>
                    <th>Foto</th>
                    <th>Nome</th>
                    <th>Espécie</th>
                    <th>Raça</th>
                    <th>Status</th>
                    <th>Ações</th>
                </tr>
            </thead>

            <tbody>

                <?php while ($animal = $resultado->fetch_assoc()) { ?>

                    <tr>

                        <td>

                            <?php if (!empty($animal["foto"])) { ?>

                                <img
                                    src="../../img/animais/<?= htmlspecialchars($animal["foto"]) ?>"
                                    alt="<?= htmlspecialchars($animal["nome"]) ?>"
                                    class="foto-animal"
                                >

                            <?php } else { ?>

                                <div class="sem-foto">
                                    🐶
                                </div>

                            <?php } ?>

                        </td>

                        <td>
                            <strong>
                                <?= htmlspecialchars($animal["nome"]) ?>
                            </strong>
                        </td>

                        <td>
                            <?= htmlspecialchars($animal["especie"]) ?>
                        </td>

                        <td>
                            <?= htmlspecialchars($animal["raca"]) ?>
                        </td>

                        <td>
                            <span class="status">
                                <?= htmlspecialchars($animal["status_adocao"]) ?>
                            </span>
                        </td>

                        <td class="acoes">

                            <a
                                href="editar.php?id=<?= $animal["id"] ?>"
                                class="btn-editar"
                            >
                                ✏️ Editar
                            </a>

                            <a
                                href="excluir.php?id=<?= $animal["id"] ?>"
                                class="btn-excluir"
                                onclick="return confirm('Tem certeza que deseja excluir este animal?');"
                            >
                                🗑️ Excluir
                            </a>

                        </td>

                    </tr>

                <?php } ?>

            </tbody>

        </table>

    </div>

</div>