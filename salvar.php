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

    session_start();

    $_SESSION['id'] = $conn->insert_id;
    $_SESSION['nome'] = $nome;
    $_SESSION['email'] = $email;

    header("Location: index.php");
    exit();

}else{

    echo "<script>
        alert('Erro ao cadastrar!');
        window.history.back();
    </script>";

}

$conn->close();

?>