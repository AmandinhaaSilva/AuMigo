<?php
include("conexao.php");

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $nome = trim($_POST["nome"] ?? "");
    $email = trim($_POST["email"] ?? "");
    $telefone = trim($_POST["telefone"] ?? "");
    $senha = $_POST["senha"] ?? "";

    if (empty($nome) || empty($email) || empty($senha)) {
        die("Preencha todos os campos obrigatórios.");
    }

    $sqlVerifica = "SELECT id FROM usuarios WHERE email = ?";
    $stmtVerifica = $conexao->prepare($sqlVerifica);
    $stmtVerifica->bind_param("s", $email);
    $stmtVerifica->execute();
    $resultado = $stmtVerifica->get_result();

    if ($resultado->num_rows > 0) {
        die("Esse e-mail já está cadastrado.");
    }

    $senhaCriptografada = password_hash($senha, PASSWORD_DEFAULT);

    $sql = "INSERT INTO usuarios (nome, email, senha, telefone) VALUES (?, ?, ?, ?)";
    $stmt = $conexao->prepare($sql);
    $stmt->bind_param("ssss", $nome, $email, $senhaCriptografada, $telefone);

    if ($stmt->execute()) {
        echo "Cadastro realizado com sucesso!";
    } else {
        echo "Erro ao cadastrar: " . $stmt->error;
    }

    $stmt->close();
    $stmtVerifica->close();
    $conexao->close();
} else {
    echo "Acesso inválido.";
}
?>