function adicionarCarrinho(nome, preco) {
    let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

    carrinho.push({
        nome: nome,
        preco: Number(preco)
    });

    localStorage.setItem("carrinho", JSON.stringify(carrinho));

    alert("Produto adicionado ao carrinho 🐾");
    atualizarContador();
}

function carregarCarrinho() {
    let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];
    let lista = document.getElementById("listaCarrinho");
    let totalTexto = document.getElementById("totalCarrinho");

    if (!lista || !totalTexto) return;

    lista.innerHTML = "";
    let total = 0;

    if (carrinho.length === 0) {
        lista.innerHTML = "<p class='carrinho-vazio'>Seu carrinho está vazio 🐶</p>";
    } else {
        carrinho.forEach((item, index) => {
            total += item.preco;

            lista.innerHTML += `
                <div class="item-carrinho">
                    <div>
                        <strong>${item.nome}</strong>
                        <p>R$ ${item.preco.toFixed(2).replace(".", ",")}</p>
                    </div>

                    <button onclick="removerItem(${index})">Remover</button>
                </div>
            `;
        });
    }

    totalTexto.innerText = total.toFixed(2).replace(".", ",");
}

function removerItem(index) {
    let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

    carrinho.splice(index, 1);

    localStorage.setItem("carrinho", JSON.stringify(carrinho));

    carregarCarrinho();
    atualizarContador();
}

function atualizarContador() {
    let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];
    let contador = document.getElementById("contadorCarrinho");

    if (contador) {
        contador.innerText = carrinho.length;
    }
}

function finalizarCompra() {
    alert("Compra finalizada! Obrigada por ajudar a AuMigo 🐶💗");

    localStorage.removeItem("carrinho");

    carregarCarrinho();
    atualizarContador();
}

document.addEventListener("DOMContentLoaded", function () {
    carregarCarrinho();
    atualizarContador();
});