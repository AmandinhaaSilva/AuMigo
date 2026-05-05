let carrinho = [];

function adicionarCarrinho(nome, preco) {
  const item = carrinho.find(produto => produto.nome === nome);

  if (item) {
    item.quantidade++;
  } else {
    carrinho.push({
      nome: nome,
      preco: preco,
      quantidade: 1
    });
  }

  atualizarCarrinho();
}

function atualizarCarrinho() {
  const lista = document.getElementById("listaCarrinho");
  const totalCarrinho = document.getElementById("totalCarrinho");

  lista.innerHTML = "";

  let total = 0;

  if (carrinho.length === 0) {
    lista.innerHTML = `<p class="carrinho-vazio">Seu carrinho está vazio 🐶</p>`;
  }

  carrinho.forEach((item, index) => {
    total += item.preco * item.quantidade;

    lista.innerHTML += `
      <div class="item-carrinho">
        <div class="item-info">
          <strong>${item.nome}</strong>
          <span>R$ ${(item.preco * item.quantidade).toFixed(2).replace(".", ",")}</span>
        </div>

        <div class="controles-carrinho">
          <button onclick="diminuirItem(${index})">-</button>
          <span>${item.quantidade}</span>
          <button onclick="aumentarItem(${index})">+</button>
          <button class="excluir" onclick="removerItem(${index})">x</button>
        </div>
      </div>
    `;
  });

  totalCarrinho.innerText = total.toFixed(2).replace(".", ",");
}

function aumentarItem(index) {
  carrinho[index].quantidade++;
  atualizarCarrinho();
}

function diminuirItem(index) {
  if (carrinho[index].quantidade > 1) {
    carrinho[index].quantidade--;
  } else {
    carrinho.splice(index, 1);
  }

  atualizarCarrinho();
}

function removerItem(index) {
  carrinho.splice(index, 1);
  atualizarCarrinho();
}

function mostrarPagamento() {
  const forma = document.querySelector('input[name="formaPagamento"]:checked').value;

  document.getElementById("pixBox").style.display = "none";
  document.getElementById("cartaoBox").style.display = "none";

  if (forma === "Pix") {
    document.getElementById("pixBox").style.display = "block";
  } else {
    document.getElementById("cartaoBox").style.display = "block";
  }
}

function finalizarCompra() {
  const forma = document.querySelector('input[name="formaPagamento"]:checked');

  if (carrinho.length === 0) {
    alert("Seu carrinho está vazio!");
    return;
  }

  if (!forma) {
    alert("Escolha uma forma de pagamento.");
    return;
  }

  alert("Compra finalizada com sucesso!");

  carrinho = [];
  atualizarCarrinho();
}