<?php

require_once("../../conexao.php");

$mensagem = "";
$erro = "";

if ($_SERVER["REQUEST_METHOD"] == "POST") {

    $nome = trim($_POST["nome"]);
    $descricao = trim($_POST["descricao"]);
    $categoria = trim($_POST["categoria"]);
    $preco = $_POST["preco"];
    $preco_antigo = $_POST["preco_antigo"];
    $destaque = trim($_POST["destaque"]);

    $imagem = "";

    // Verifica se foi enviada uma imagem
    if (isset($_FILES["imagem"]) && $_FILES["imagem"]["error"] == 0) {

        $nomeImagem = $_FILES["imagem"]["name"];
        $nomeTemporario = $_FILES["imagem"]["tmp_name"];

        $pasta = "../../img/";

        // Mantém o nome original da imagem
        $imagem = basename($nomeImagem);

        move_uploaded_file(
            $nomeTemporario,
            $pasta . $imagem
        );
    }

    $sql = "INSERT INTO produtos 
            (nome, descricao, categoria, preco, preco_antigo, imagem, destaque)
            VALUES (?, ?, ?, ?, ?, ?, ?)";

    $stmt = $conn->prepare($sql);

    $stmt->bind_param(
        "sssddss",
        $nome,
        $descricao,
        $categoria,
        $preco,
        $preco_antigo,
        $imagem,
        $destaque
    );

    if ($stmt->execute()) {

        header("Location: listar.php");
        exit();

    } else {

        $erro = "Erro ao cadastrar produto: " . $conn->error;
    }
}

?>

<h1 class="titulo">🛒 Novo Produto</h1>

<br>

<?php if ($erro != "") { ?>

    <p style="color:red;">
        <?= htmlspecialchars($erro) ?>
    </p>

<?php } ?>

<form method="POST" enctype="multipart/form-data">

    <label>Nome do produto:</label>

    <input
        type="text"
        name="nome"
        required
    >

    <br><br>


    <label>Descrição:</label>

    <textarea
        name="descricao"
        rows="5"
        required
    ></textarea>

    <br><br>


    <label>Categoria:</label>

    <select name="categoria" required>

        <option value="">Selecione uma categoria</option>

        <option value="racao">🍖 Ração</option>

        <option value="petiscos">🦴 Petiscos</option>

        <option value="acessorios">🦮 Acessórios</option>

        <option value="higiene">🛁 Higiene</option>

        <option value="roupinhas">👕 Roupinhas</option>

        <option value="brinquedos">🎾 Brinquedos</option>

    </select>

    <br><br>


    <label>Preço:</label>

    <input
        type="number"
        name="preco"
        step="0.01"
        min="0"
        required
    >

    <br><br>


    <label>Preço antigo:</label>

    <input
        type="number"
        name="preco_antigo"
        step="0.01"
        min="0"
    >

    <br><br>


    <label>Imagem:</label>

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
        placeholder="Ex: Promoção, Novo, Destaque..."
    >

    <br><br>


    <button type="submit" class="btn">
        💾 Cadastrar Produto
    </button>

    <a href="listar.php" class="btn">
        Cancelar
    </a>

</form>