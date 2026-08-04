<?php
session_start();
require_once("../conexao.php");

$erro = "";

if ($_SERVER["REQUEST_METHOD"] == "POST") {

    $email = $_POST["email"];
    $senha = hash("sha256", $_POST["senha"]);

    $sql = "SELECT * FROM administradores WHERE email = ? AND senha = ?";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ss", $email, $senha);
    $stmt->execute();

    $resultado = $stmt->get_result();

    if ($resultado->num_rows == 1) {

        $admin = $resultado->fetch_assoc();

        $_SESSION["admin_id"] = $admin["id"];
        $_SESSION["admin_nome"] = $admin["nome"];

        header("Location: dashboard.php");
        exit();

    } else {

        $erro = "E-mail ou senha inválidos.";

    }
}
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>

<meta charset="UTF-8">

<title>Login Administrativo</title>

<style>

body{
    background:#f4f4f4;
    font-family:Arial;
}

.login{
    width:350px;
    margin:80px auto;
    background:white;
    padding:30px;
    border-radius:10px;
    box-shadow:0 0 10px rgba(0,0,0,.2);
}

input{
    width:100%;
    padding:12px;
    margin-top:10px;
    margin-bottom:15px;
}

button{
    width:100%;
    padding:12px;
    background:#4CAF50;
    color:white;
    border:none;
    cursor:pointer;
}

.erro{
    color:red;
}

</style>

</head>

<body>

<div class="login">

<h2>Administrador AuMigo</h2>

<?php
if($erro!=""){
    echo "<p class='erro'>$erro</p>";
}
?>

<form method="POST">

<input
type="email"
name="email"
placeholder="E-mail"
required>

<input
type="password"
name="senha"
placeholder="Senha"
required>

<button>Entrar</button>

</form>

</div>

</body>
</html>