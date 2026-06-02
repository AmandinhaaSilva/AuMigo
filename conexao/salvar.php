<?php

include("conexao.php");

$nome = $_POST['nome'];
$endereco = $_POST['endereco'];
$telefone = $_POST['telefone'];
$email = $_POST['email'];
$cpf = $_POST['cpf'];
$senha = $_POST['senha'];

$sql = "INSERT INTO usuarios
(Nome, Endereco, Telefone, Email, CPF, Senha, Data_cadastrada)
VALUES
('$nome', '$endereco', '$telefone', '$email', '$cpf', '$senha', NOW())";

if(mysqli_query($conexao, $sql)){
    echo "Cadastro realizado com sucesso!";
}else{
    echo "Erro: " . mysqli_error($conexao);
}