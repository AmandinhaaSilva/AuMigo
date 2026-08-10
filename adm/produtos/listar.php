<?php

require_once("../../conexao.php");

$sql = "SELECT * FROM produtos ORDER BY id DESC";
$resultado = $conn->query($sql);

?>

<h1 class="titulo">🛒 Produtos</h1>

<a href="adicionar.php" class="btn">+ Novo Produto</a>

<br><br>

<table class="tabela">

    <tr>
        <th>Imagem</th>
        <th>Nome</th>
        <th>Categoria</th>
        <th>Preço</th>
        <th>Destaque</th>
        <th>Ações</th>
    </tr>

    <?php while ($produto = $resultado->fetch_assoc()) { ?>

        <?php
        $imagem = trim($produto["imagem"]);

        // Caminho da imagem
        $imagemUrl = "http://localhost/AUMIGO/img/" . $imagem;
        ?>

        <tr>

            <td>

                <?php if (!empty($imagem)) { ?>

                    <img
                        src="<?= $imagemUrl ?>"
                        alt="<?= htmlspecialchars($produto["nome"]) ?>"
                        width="70"
                        height="70"
                        style="
                            width:70px;
                            height:70px;
                            object-fit:cover;
                            border-radius:10px;
                        "
                    >

                <?php } else { ?>

                    Sem imagem

                <?php } ?>

            </td>

            <td>
                <?= htmlspecialchars($produto["nome"]) ?>
            </td>

            <td>
                <?= htmlspecialchars($produto["categoria"]) ?>
            </td>

            <td>
                R$ <?= number_format($produto["preco"], 2, ",", ".") ?>
            </td>

            <td>
                <?= htmlspecialchars($produto["destaque"]) ?>
            </td>

            <td>

                <a href="editar.php?id=<?= $produto["id"] ?>">
                    ✏ Editar
                </a>

                |

                <a
                    href="excluir.php?id=<?= $produto["id"] ?>"
                    onclick="return confirm('Tem certeza que deseja excluir este produto?');"
                >
                    🗑 Excluir
                </a>

            </td>

        </tr>

    <?php } ?>

</table>