<?php

$conn = new mysqli("localhost", "root", "", "aumigo");

if ($conn->connect_error) {
    die("Erro na conexão!");
}

$nome = $_POST['nome'];
$endereco = $_POST['endereco'];
$telefone = $_POST['telefone'];
$email = $_POST['email'];
$cpf = $_POST['cpf'];
$senha = $_POST['senha'];

$sql = "INSERT INTO usuarios
(nome,endereco,telefone,email,cpf,senha)
VALUES
('$nome','$endereco','$telefone','$email','$cpf','$senha')";

if($conn->query($sql)){
    echo "Cadastro realizado com sucesso!";
} else {
    echo "Erro ao cadastrar!";
}

$conn->close();

?>