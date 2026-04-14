<?php
session_start();
include("conexao.php");

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $email = trim($_POST["email"] ?? "");
    $senha = $_POST["senha"] ?? "";

    if (empty($email) || empty($senha)) {
        die("Preencha e-mail e senha.");
    }

    $sql = "SELECT id, nome, senha, tipo_usuario FROM usuarios WHERE email = ?";
    $stmt = $conexao->prepare($sql);
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $resultado = $stmt->get_result();

    if ($resultado->num_rows == 1) {
        $usuario = $resultado->fetch_assoc();

        if (password_verify($senha, $usuario["senha"])) {
            $_SESSION["usuario_id"] = $usuario["id"];
            $_SESSION["usuario_nome"] = $usuario["nome"];
            $_SESSION["tipo_usuario"] = $usuario["tipo_usuario"];

            $sqlHistorico = "INSERT INTO historico_login (usuario_id) VALUES (?)";
            $stmtHistorico = $conexao->prepare($sqlHistorico);
            $stmtHistorico->bind_param("i", $usuario["id"]);
            $stmtHistorico->execute();
            $stmtHistorico->close();

            echo "Login realizado com sucesso!";
        } else {
            echo "Senha incorreta!";
        }
    } else {
        echo "Usuário não encontrado!";
    }

    $stmt->close();
    $conexao->close();
} else {
    echo "Acesso inválido.";
}
?>