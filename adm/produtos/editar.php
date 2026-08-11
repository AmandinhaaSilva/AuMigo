<?php

require_once("../../conexao.php");


// Verifica se foi informado o ID do produto
if (!isset($_GET["id"]) || empty($_GET["id"])) {
    header("Location: listar.php");
    exit();
}

$id = intval($_GET["id"]);


// Busca o produto no banco
$sql = "SELECT * FROM produtos WHERE id = ?";

$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $id);
$stmt->execute();

$resultado = $stmt->get_result();


// Verifica se o produto existe
if ($resultado->num_rows == 0) {
    echo "Produto não encontrado.";
    exit();
}

$produto = $resultado->fetch_assoc();


// Se o formulário foi enviado
if ($_SERVER["REQUEST_METHOD"] == "POST") {

    $nome = trim($_POST["nome"]);
    $descricao = trim($_POST["descricao"]);
    $categoria = trim($_POST["categoria"]);
    $preco = $_POST["preco"];
    $preco_antigo = $_POST["preco_antigo"];
    $destaque = trim($_POST["destaque"]);

    // Mantém a imagem antiga
    $imagem = $produto["imagem"];


    // Verifica se foi escolhida uma nova imagem
    if (isset($_FILES["imagem"]) && $_FILES["imagem"]["error"] == 0) {

        $nomeImagem = basename($_FILES["imagem"]["name"]);
        $nomeTemporario = $_FILES["imagem"]["tmp_name"];

        $pasta = "../../img/";

        // Salva a nova imagem
        if (move_uploaded_file($nomeTemporario, $pasta . $nomeImagem)) {

            $imagem = $nomeImagem;
        }
    }


    // Atualiza o produto
    $sql = "UPDATE produtos SET
            nome = ?,
            descricao = ?,
            categoria = ?,
            preco = ?,
            preco_antigo = ?,
            imagem = ?,
            destaque = ?
            WHERE id = ?";

    $stmt = $conn->prepare($sql);

    $stmt->bind_param(
        "sssddssi",
        $nome,
        $descricao,
        $categoria,
        $preco,
        $preco_antigo,
        $imagem,
        $destaque,
        $id
    );


    if ($stmt->execute()) {

        header("Location: listar.php");
        exit();

    } else {

        echo "Erro ao atualizar produto: " . $conn->error;
    }
}

?>


<h1 class="titulo">✏ Editar Produto</h1>

<br>


<form method="POST" enctype="multipart/form-data">

    <label>Nome do produto:</label>

    <input
        type="text"
        name="nome"
        value="<?= htmlspecialchars($produto["nome"]) ?>"
        required
    >

    <br><br>


    <label>Descrição:</label>

    <textarea
        name="descricao"
        rows="5"
        required
    ><?= htmlspecialchars($produto["descricao"]) ?></textarea>

    <br><br>


    <label>Categoria:</label>

    <select name="categoria" required>

        <option value="">Selecione uma categoria</option>

        <option value="racao"
            <?= $produto["categoria"] == "racao" ? "selected" : "" ?>>
            🍖 Ração
        </option>

        <option value="petiscos"
            <?= $produto["categoria"] == "petiscos" ? "selected" : "" ?>>
            🦴 Petiscos
        </option>

        <option value="acessorios"
            <?= $produto["categoria"] == "acessorios" ? "selected" : "" ?>>
            🦮 Acessórios
        </option>

        <option value="higiene"
            <?= $produto["categoria"] == "higiene" ? "selected" : "" ?>>
            🛁 Higiene
        </option>

        <option value="roupinhas"
            <?= $produto["categoria"] == "roupinhas" ? "selected" : "" ?>>
            👕 Roupinhas
        </option>

        <option value="brinquedos"
            <?= $produto["categoria"] == "brinquedos" ? "selected" : "" ?>>
            🎾 Brinquedos
        </option>

    </select>

    <br><br>


    <label>Preço:</label>

    <input
        type="number"
        name="preco"
        step="0.01"
        min="0"
        value="<?= htmlspecialchars($produto["preco"]) ?>"
        required
    >

    <br><br>


    <label>Preço antigo:</label>

    <input
        type="number"
        name="preco_antigo"
        step="0.01"
        min="0"
        value="<?= htmlspecialchars($produto["preco_antigo"]) ?>"
    >

    <br><br>


    <label>Imagem atual:</label>

    <p>
        <?= !empty($produto["imagem"])
            ? htmlspecialchars($produto["imagem"])
            : "Nenhuma imagem cadastrada." ?>
    </p>


    <label>Trocar imagem:</label>

    <input
        type="file"
        name="imagem"
        accept=".jpg,.jpeg,.png"
    >

    <br><br>


    <label>Destaque:</label>

    <input
        type="text"
        name="destaque"
        value="<?= htmlspecialchars($produto["destaque"]) ?>"
        placeholder="Ex: Promoção, Novo, Destaque..."
    >

    <br><br>


    <button type="submit" class="btn">
        💾 Salvar Alterações
    </button>

    <a href="listar.php" class="btn">
        Cancelar
    </a>

</form>