<?php
require_once("../includes/verifica_login.php");
require_once("../../conexao.php");

$sql = "SELECT * FROM animais ORDER BY id DESC";
$resultado = $conn->query($sql);

include("../includes/header.php");
include("../includes/menu.php");
?>

<div class="content">

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

        <?php while($animal = $resultado->fetch_assoc()){ ?>

        <tr>

            <td>

                <?php
                if(!empty($animal["foto"]) && file_exists("../../img/animais/" . $animal["foto"])){

    echo "<img src='../img/animais/".$animal["foto"]."' width='70' height='70' style='object-fit:cover;border-radius:10px;'>";

}else{

    echo "Sem foto";

}
                ?>

            </td>

            <td><?= $animal["nome"] ?></td>

            <td><?= $animal["especie"] ?></td>

            <td><?= $animal["raca"] ?></td>

            <td><?= $animal["status_adocao"] ?></td>

            <td>

                <a href="editar.php?id=<?= $animal['id'] ?>">✏ Editar</a>

                |

                <a href="excluir.php?id=<?= $animal['id'] ?>">🗑 Excluir</a>

            </td>

        </tr>

        <?php } ?>

    </table>

</div>

<?php include("../includes/footer.php"); ?>