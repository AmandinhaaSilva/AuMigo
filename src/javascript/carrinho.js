function adicionarCarrinho(nome, preco) {

    let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

    const produtoExistente = carrinho.find(item => item.nome === nome);

    if (produtoExistente) {
        produtoExistente.quantidade++;
    } else {

        carrinho.push({
            nome: nome,
            preco: Number(preco),
            quantidade: 1
        });

    }

    localStorage.setItem("carrinho", JSON.stringify(carrinho));

    atualizarContador();

    alert("Produto adicionado ao carrinho 🐾");
}

function carregarCarrinho() {

    let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

    let lista = document.getElementById("listaCarrinho");
    let totalTexto = document.getElementById("totalCarrinho");

    if (!lista || !totalTexto) return;

    lista.innerHTML = "";

    let total = 0;

    if (carrinho.length === 0) {

        lista.innerHTML = `
            <p class="carrinho-vazio">
                Seu carrinho está vazio 🐶
            </p>
        `;

    } else {

        carrinho.forEach((item, index) => {

            let subtotal = item.preco * item.quantidade;

            total += subtotal;

            lista.innerHTML += `

                <div class="item-carrinho">

                    <div>

                        <h3>${item.nome}</h3>

                        <p>
                            R$ ${item.preco.toFixed(2).replace(".", ",")}
                        </p>

                        <p>
                            Quantidade: ${item.quantidade}
                        </p>

                        <strong>
                            Subtotal:
                            R$ ${subtotal.toFixed(2).replace(".", ",")}
                        </strong>

                    </div>

                    <div class="acoes">

                        <button onclick="diminuirQuantidade(${index})">
                            -
                        </button>

                        <button onclick="aumentarQuantidade(${index})">
                            +
                        </button>

                        <button onclick="removerItem(${index})">
                            Remover
                        </button>

                    </div>

                </div>

            `;

        });

    }

    totalTexto.innerText = total.toFixed(2).replace(".", ",");

}

function aumentarQuantidade(index){

    let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

    carrinho[index].quantidade++;

    localStorage.setItem("carrinho", JSON.stringify(carrinho));

    carregarCarrinho();

    atualizarContador();

}

function diminuirQuantidade(index){

    let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

    carrinho[index].quantidade--;

    if(carrinho[index].quantidade <= 0){

        carrinho.splice(index,1);

    }

    localStorage.setItem("carrinho", JSON.stringify(carrinho));

    carregarCarrinho();

    atualizarContador();

}

function removerItem(index){

    let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

    carrinho.splice(index,1);

    localStorage.setItem("carrinho", JSON.stringify(carrinho));

    carregarCarrinho();

    atualizarContador();

}

function atualizarContador(){

    let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

    let contador = document.getElementById("contadorCarrinho");

    if(!contador) return;

    let quantidade = 0;

    carrinho.forEach(item => {

        quantidade += item.quantidade;

    });

    contador.innerText = quantidade;

}

function finalizarCompra(){

    alert("Compra finalizada! Obrigada por ajudar a AuMigo 🐶💗");

    localStorage.removeItem("carrinho");

    carregarCarrinho();

    atualizarContador();

}

document.addEventListener("DOMContentLoaded", ()=>{

    carregarCarrinho();

    atualizarContador();

});