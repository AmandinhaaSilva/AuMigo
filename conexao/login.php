$sql = "SELECT * FROM usuarios 
        WHERE email = '$email' AND senha = '$senha'";

$result = $conn->query($sql);

if ($result->num_rows > 0) {

    $usuario = $result->fetch_assoc();
    $usuario_id = $usuario['id']; // pega o ID

    $sqlHistorico = "INSERT INTO historico_login (usuario_id)
                     VALUES ('$usuario_id')";

    $conn->query($sqlHistorico);

    echo "Login realizado com sucesso!";

} else {
    echo "Usuário ou senha incorretos!";
}
?>
