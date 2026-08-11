<header>

    <nav id="navbar">

        <img src="logo.png" alt="logo" />

        <ul id="nav_list">
        <?php
            $paginaAtual = basename($_SERVER['PHP_SELF']);

            if($paginaAtual != "index.php"){
        ?>
            <li class="nav-item">
            <a href="index.php">Início</a>
            </li>
        <?php } ?>
            <li class="nav-item">
                <a href="sobre.php">Sobre</a>
            </li>

            <li class="nav-item">
                <a href="doações.php">Doações</a>
            </li>

            <li class="nav-item">
                <a href="adoções.php">Adoções</a>
            </li>

            <li class="nav-item">
                <a href="loja.php">Loja</a>
            </li>
        </ul>

        <div class="acoes-navbar">

            <?php if(isset($_SESSION['nome'])){ ?>

                <div class="usuario-logado">

                    <div class="usuario-info">
                        <i class="fa-solid fa-user"></i>
                        <span>Olá, <?php echo explode(' ', $_SESSION['nome'])[0]; ?></span>
                    </div>

                    <a href="logout.php" class="btn-sair">
                        <i class="fa-solid fa-right-from-bracket"></i>
                        Sair
                    </a>

                </div>

            <?php } else { ?>

                <a href="entrar.html" class="btn-default">
                    Login
                </a>

            <?php } ?>

            <a href="carrinho.php" class="btn-carrinho">
                🛒
            </a>

        </div>

        <button id="mobile_btn">
            <i class="fa-solid fa-bars"></i>
        </button>

    </nav>

    <div id="mobile_menu">

        <ul id="mobile_nav_list">

            <li class="nav-item">
                <a href="sobre.php">Sobre</a>
            </li>

            <li class="nav-item">
                <a href="doações.php">Doações</a>
            </li>

            <li class="nav-item">
                <a href="adoções.php">Adoções</a>
            </li>

            <li class="nav-item">
                <a href="loja.php">Loja</a>
            </li>

            <li class="nav-item">
                <a href="carrinho.php">Carrinho</a>
            </li>

        </ul>

        <?php if(isset($_SESSION['nome'])){ ?>

            <a href="logout.php" class="btn-default">
                Sair
            </a>

        <?php } else { ?>

            <a href="entrar.html" class="btn-default">
                Login
            </a>

        <?php } ?>

    </div>

</header>