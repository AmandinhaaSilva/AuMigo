import { cartStore } from "../services/cart-store.js";

const navigationItems = [
  { href: "/", label: "Início" },
  { href: "/sobre", label: "Sobre" },
  { href: "/doacoes", label: "Doações" },
  { href: "/adocoes", label: "Adoções" },
  { href: "/loja", label: "Loja" }
];

function normalizedPath() {
  const withoutIndex = window.location.pathname.replace(/\/index\.html$/, "");
  return withoutIndex.replace(/\/$/, "") || "/";
}

function isCurrentRoute(href) {
  const current = normalizedPath();
  return href === "/" ? current === "/" : current === href || current.startsWith(`${href}/`);
}

function navigationMarkup() {
  return navigationItems
    .map(({ href, label }) => {
      const current = isCurrentRoute(href);
      return `
        <li>
          <a class="site-nav__link" href="${href}"${current ? ' aria-current="page"' : ""}>
            ${label}
          </a>
        </li>`;
    })
    .join("");
}

function headerMarkup() {
  return `
    <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <header class="site-header">
      <nav class="site-header__inner" aria-label="Navegação principal">
        <a class="site-brand" href="/" aria-label="AuFriends — página inicial">
          <span class="brand-lockup" aria-hidden="true">
            <span class="brand-lockup__icon">🐶</span>
            <span class="brand-lockup__name">Au<span>Friends</span></span>
          </span>
        </a>

        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-navigation">
          <span class="sr-only">Abrir menu</span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </button>

        <div class="site-nav" id="site-navigation">
          <ul class="site-nav__list">
            ${navigationMarkup()}
          </ul>

          <div class="site-nav__actions">
            <a class="button button--compact" href="/admin">Área administrativa</a>
            <a class="cart-link" href="/carrinho" aria-label="Abrir carrinho vazio" data-cart-link>
              <span aria-hidden="true">🛒</span>
              <span class="cart-badge" aria-hidden="true" data-cart-badge>0</span>
            </a>
          </div>
        </div>
      </nav>
    </header>`;
}

function footerMarkup() {
  return `
    <footer class="site-footer">
      <div class="site-footer__grid">
        <div class="site-footer__brand">
          <h2>Au<span>Friends</span></h2>
          <p>Porque cada bicho merece<br />um amigo de verdade!</p>
        </div>

        <div class="site-footer__column">
          <h3>Navegação</h3>
          <a href="/">Início</a>
          <a href="/sobre">Sobre</a>
          <a href="/adocoes">Adoções</a>
          <a href="/doacoes">Doações</a>
          <a href="/loja">Loja</a>
        </div>

        <div class="site-footer__column">
          <h3>Ajude o AuFriends</h3>
          <a href="/doacoes">Faça uma doação</a>
          <a href="/sobre#contato">Seja voluntário</a>
          <a href="/adocoes">Adote um animal</a>
        </div>

        <div class="site-footer__column" id="contato-rodape">
          <h3>Contato</h3>
          <a href="tel:+5517991529090">📞 (17) 99152-9090</a>
          <a href="mailto:contato@aufriends.com.br">✉ contato@aufriends.com.br</a>
        </div>
      </div>

      <div class="site-footer__bottom">
        <p>© 2026 AuFriends. Todos os direitos reservados.</p>
        <a href="/admin">Acesso da equipe</a>
      </div>
    </footer>`;
}

function setupNavigation() {
  const toggle = document.querySelector(".nav-toggle");
  const navigation = document.querySelector(".site-nav");

  if (!toggle || !navigation) return;

  const closeMenu = () => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.querySelector(".sr-only").textContent = "Abrir menu";
    navigation.classList.remove("site-nav--open");
  };

  toggle.addEventListener("click", () => {
    const willOpen = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(willOpen));
    toggle.querySelector(".sr-only").textContent = willOpen ? "Fechar menu" : "Abrir menu";
    navigation.classList.toggle("site-nav--open", willOpen);
  });

  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      toggle.focus();
    }
  });

  window.matchMedia("(min-width: 901px)").addEventListener("change", (event) => {
    if (event.matches) closeMenu();
  });
}

function setupCartBadge() {
  const link = document.querySelector("[data-cart-link]");
  const badge = document.querySelector("[data-cart-badge]");
  if (!link || !badge) return;

  const render = ({ totalQuantity = cartStore.getTotalQuantity() } = {}) => {
    badge.textContent = String(totalQuantity);
    link.setAttribute(
      "aria-label",
      totalQuantity === 0
        ? "Abrir carrinho vazio"
        : `Abrir carrinho com ${totalQuantity} ${totalQuantity === 1 ? "item" : "itens"}`
    );
  };

  cartStore.subscribe(render);
  render();
}

export function mountSiteShell() {
  const header = document.querySelector("[data-site-header]");
  const footer = document.querySelector("[data-site-footer]");

  if (header) header.innerHTML = headerMarkup();
  if (footer) footer.innerHTML = footerMarkup();

  setupNavigation();
  setupCartBadge();
}
