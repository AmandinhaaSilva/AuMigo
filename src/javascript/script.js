
$(document).ready(function() {
    $('#mobile_btn').on('click', function() {
        $('#mobile_menu').toggleClass('active');
        $('#mobile_btn').find('i').toggleClass('fa-x');
    });
});

// FILTRO POR CATEGORIA
const botoesCategoria = document.querySelectorAll(".filtro-categoria");
const produtos = document.querySelectorAll(".produto-card");

botoesCategoria.forEach(botao => {
    botao.addEventListener("click", () => {

        const categoria = botao.dataset.categoria;

        produtos.forEach(produto => {

            if(produto.dataset.categoria === categoria){
                produto.style.display = "block";
            } else {
                produto.style.display = "none";
            }

        });

    });
});


// FILTRO POR PREÇO
const botoesPreco = document.querySelectorAll(".filtro-preco");

botoesPreco.forEach(botao => {

    botao.addEventListener("click", () => {

        const faixa = botao.dataset.faixa;

        produtos.forEach(produto => {

            const preco = parseFloat(produto.dataset.preco);

            if(faixa === "30"){

                produto.style.display = preco <= 30
                    ? "block"
                    : "none";

            }

            else if(faixa === "30-80"){

                produto.style.display = (preco > 30 && preco <= 80)
                    ? "block"
                    : "none";

            }

            else if(faixa === "80"){

                produto.style.display = preco > 80
                    ? "block"
                    : "none";

            }

        });

    });

});


// MOSTRAR TODOS
document.getElementById("mostrar-todos")
.addEventListener("click", () => {

    produtos.forEach(produto => {
        produto.style.display = "block";
    });

});