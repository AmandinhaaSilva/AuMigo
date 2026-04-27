<?php
include("conexao.php");

$email = $_POST['email'];
$senha = $_POST['senha'];

$sql = "SELECT * FROM usuarios 
        WHERE email = '$email' AND senha = '$senha'";

$result = $conn->query($sql);

if ($result->num_rows > 0) {

    $data = date("Y-m-d H:i:s");

    $sqlHistorico = "INSERT INTO historico_login (email, data_login)
                     VALUES ('$email', '$data')";

    $conn->query($sqlHistorico);

    echo "Login realizado com sucesso!";

} else {
    echo "Usuário ou senha incorretos!";
}
?>
