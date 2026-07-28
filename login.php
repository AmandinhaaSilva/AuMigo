<?php
session_start();

include("conexao.php");

$email = $_POST['email'];
$senha = $_POST['senha'];

$sql = "SELECT * FROM usuarios WHERE email='$email' AND senha='$senha'";

$resultado = $conn->query($sql);

if($resultado->num_rows > 0){

    $usuario = $resultado->fetch_assoc();

    $_SESSION['id'] = $usuario['id'];
    $_SESSION['nome'] = $usuario['nome'];
    $_SESSION['email'] = $usuario['email'];

    header("Location: index.php");
    exit();

}else{

    echo "<script>
        alert('Email ou senha incorretos!');
        window.location='entrar.html';
    </script>";

}

$conn->close();
?>