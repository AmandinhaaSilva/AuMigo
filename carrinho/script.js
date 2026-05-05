// ===== CARRINHO =====
let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

// ===== ADICIONAR PRODUTO =====
function adicionarCarrinho(nome, preco) {
  const item = carrinho.find(p => p.nome === nome);

  if (item) {
    item.quantidade++;
  } else {
    carrinho.push({
      nome: nome,
      preco: preco,
      quantidade: 1
    });
  }

  salvarCarrinho();
  atualizarCarrinho();
}

// ===== ATUALIZAR TELA =====
function atualizarCarrinho() {
  const lista = document.getElementById("listaCarrinho");
  const totalSpan = document.getElementById("totalCarrinho");

  if (!lista || !totalSpan) return;

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

  totalSpan.innerText = total.toFixed(2).replace(".", ",");
}

// ===== CONTROLES =====
function aumentarItem(index) {
  carrinho[index].quantidade++;
  salvarCarrinho();
  atualizarCarrinho();
}

function diminuirItem(index) {
  if (carrinho[index].quantidade > 1) {
    carrinho[index].quantidade--;
  } else {
    carrinho.splice(index, 1);
  }

  salvarCarrinho();
  atualizarCarrinho();
}

function removerItem(index) {
  carrinho.splice(index, 1);
  salvarCarrinho();
  atualizarCarrinho();
}

// ===== SALVAR NO NAVEGADOR =====
function salvarCarrinho() {
  localStorage.setItem("carrinho", JSON.stringify(carrinho));
}

// ===== PAGAMENTO =====
function configurarPagamento() {
  const radios = document.querySelectorAll('input[name="formaPagamento"]');

  radios.forEach(radio => {
    radio.addEventListener("change", function () {

      const pix = document.getElementById("pixBox");
      const cartao = document.getElementById("cartaoBox");

      if (!pix || !cartao) return;

      pix.style.display = "none";
      cartao.style.display = "none";

      if (this.value === "Pix") {
        pix.style.display = "block";
      }

      if (this.value === "Debito" || this.value === "Credito") {
        cartao.style.display = "block";
      }
    });
  });
}

// ===== FINALIZAR =====
function finalizarCompra() {
  const forma = document.querySelector('input[name="formaPagamento"]:checked');

  if (carrinho.length === 0) {
    alert("Seu carrinho está vazio!");
    return;
  }

  if (!forma) {
    alert("Escolha uma forma de pagamento!");
    return;
  }

  if (forma.value === "Pix") {
    alert("Finalize o pagamento via Pix usando a chave exibida.");
  } else {
    alert("Pagamento com cartão realizado com sucesso!");
  }

  carrinho = [];
  salvarCarrinho();
  atualizarCarrinho();
}

// ===== INICIAR =====
window.onload = function () {
  atualizarCarrinho();
  configurarPagamento();
};