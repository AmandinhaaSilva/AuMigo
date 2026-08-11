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

// =====================
// VALIDAÇÃO DA SENHA
// =====================
if (
    strlen($senha) < 8 ||
    !preg_match('/[A-Z]/', $senha) ||
    !preg_match('/[a-z]/', $senha) ||
    !preg_match('/[0-9]/', $senha) ||
    !preg_match('/[\W_]/', $senha)
) {
    echo "<script>
        alert('A senha deve ter no mínimo 8 caracteres, uma letra maiúscula, uma minúscula, um número e um símbolo.');
        window.history.back();
    </script>";
    exit();
}


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