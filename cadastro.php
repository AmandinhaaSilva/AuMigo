<?php
include("conexao.php");

$nome = $_POST['nome'];
$email = $_POST['email'];
$senha = $_POST['senha'];

$sql = "INSERT INTO usuarios(nome,email,senha)
VALUES('$nome','$email','$senha')";

if($conn->query($sql)){
    echo "Cadastro realizado!";
}else{
    echo "Erro!";
}
?>