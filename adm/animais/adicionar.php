<?php
require_once("../includes/verifica_login.php");
require_once("../../conexao.php");

if (isset($_POST["salvar"])) {

    $nome = $_POST["nome"];
    $especie = $_POST["especie"];
    $raca = $_POST["raca"];
    $idade = $_POST["idade"];
    $sexo = $_POST["sexo"];
    $porte = $_POST["porte"];
    $cor = $_POST["cor"];
    $descricao = $_POST["descricao"];
    $status = $_POST["status"];

    // Upload da foto
    $foto = "";

    if (isset($_FILES["foto"]) && $_FILES["foto"]["error"] == 0) {

        $extensao = pathinfo($_FILES["foto"]["name"], PATHINFO_EXTENSION);

        $foto = time() . "." . $extensao;

        $destino = "../../img/animais/" . $foto;

        if (move_uploaded_file($_FILES["foto"]["tmp_name"], $destino)) {
    echo "<script>alert('Imagem enviada com sucesso!');</script>";
} else {
    echo "<script>alert('Erro ao enviar a imagem!');</script>";
}
    }

    $sql = "INSERT INTO animais
    (nome, especie, raca, idade, sexo, porte, cor, descricao, status_adocao, foto)
    VALUES (?,?,?,?,?,?,?,?,?,?)";

    $stmt = $conn->prepare($sql);

    $stmt->bind_param(
        "sssissssss",
        $nome,
        $especie,
        $raca,
        $idade,
        $sexo,
        $porte,
        $cor,
        $descricao,
        $status,
        $foto
    );

    $stmt->execute();

    header("Location: listar.php");
    exit();
}

include("../includes/header.php");
include("../includes/menu.php");
?>

<div class="content">

<h1 class="titulo">Cadastrar Animal</h1>

<form method="POST" enctype="multipart/form-data" class="formulario">

<label>Nome</label>
<input type="text" name="nome" required>

<label>Espécie</label>
<input type="text" name="especie" required>

<label>Raça</label>
<input type="text" name="raca">

<label>Idade</label>
<input type="number" name="idade">

<label>Sexo</label>
<select name="sexo">
    <option>Macho</option>
    <option>Fêmea</option>
</select>

<label>Porte</label>
<select name="porte">
    <option>Pequeno</option>
    <option>Médio</option>
    <option>Grande</option>
</select>

<label>Cor</label>
<input type="text" name="cor">

<label>Descrição</label>
<textarea name="descricao"></textarea>

<label>Foto do Animal</label>
<input type="file" name="foto" accept="image/*">

<label>Status</label>
<select name="status">
    <option>Disponível</option>
    <option>Em processo</option>
    <option>Adotado</option>
</select>

<br><br>

<button type="submit" name="salvar" class="btn">
    Salvar Animal
</button>

</form>

</div>

<?php include("../includes/footer.php"); ?>