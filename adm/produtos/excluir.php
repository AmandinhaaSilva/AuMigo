<?php

require_once("../../conexao.php");

// Verifica se o ID foi informado
if (!isset($_GET["id"]) || empty($_GET["id"])) {
    header("Location: listar.php");
    exit();
}

$id = intval($_GET["id"]);

// Primeiro busca a imagem do produto
$sql = "SELECT imagem FROM produtos WHERE id = ?";

$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $id);
$stmt->execute();

$resultado = $stmt->get_result();

if ($resultado->num_rows == 0) {
    header("Location: listar.php");
    exit();
}

$produto = $resultado->fetch_assoc();


// Exclui o produto do banco
$sql = "DELETE FROM produtos WHERE id = ?";

$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $id);

if ($stmt->execute()) {

    // Se o produto tinha uma imagem, tenta apagar o arquivo
    if (!empty($produto["imagem"])) {

        $caminhoImagem = "../../img/" . $produto["imagem"];

        if (file_exists($caminhoImagem)) {
            unlink($caminhoImagem);
        }
    }

    // Volta para a lista de produtos
    header("Location: listar.php");
    exit();

} else {

    echo "Erro ao excluir produto: " . $conn->error;
}

?>