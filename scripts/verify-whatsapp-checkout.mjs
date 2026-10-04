import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  getDocFromServer,
  getDocs,
  getFirestore,
  orderBy,
  query,
  where,
  doc
} from "firebase/firestore";
import { T11_PRODUCTS } from "./fixtures/products-t11.mjs";
import {
  CART_STORAGE_KEY,
  createCartStore,
  reconcileCartItems
} from "../web/src/services/cart-store.js";
import {
  WhatsAppCheckoutValidationError,
  buildWhatsAppCheckout,
  createCheckoutSettingsService,
  createCheckoutSummary,
  normalizeCheckoutSettings,
  normalizeWhatsappDigits,
  openWhatsAppCheckout
} from "../web/src/services/whatsapp-checkout.js";

const PROJECT_ID = "demo-aufriends-local";
const HOST = "127.0.0.1";
const HUB_URL = `http://${HOST}:4400/emulators`;
const HOSTING_CART_URL = `http://${HOST}:5000/carrinho/`;
const ADMIN = Object.freeze({
  uid: "local-admin-aufriends",
  email: "admin@aufriends.local",
  password: "AuFriendsLocal!2026"
});
const suffix = crypto.randomUUID().toLowerCase();
const apps = [];
let passed = 0;
let failed = 0;

function requireLocalEnvironment() {
  for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
    if (process.env[name] && process.env[name] !== PROJECT_ID) {
      throw new Error(`${name} recusado: a verificação aceita somente ${PROJECT_ID}.`);
    }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_CONFIG) {
    throw new Error("Verificação recusada: credencial ou configuração Firebase externa detectada.");
  }
}

async function requireOfficialEmulators() {
  const response = await fetch(HUB_URL, { signal: AbortSignal.timeout(3_000) });
  if (!response.ok) throw new Error(`Hub local indisponível (${response.status}).`);
  const running = await response.json();
  for (const [name, port] of Object.entries({ auth: 9099, firestore: 8080 })) {
    if (running[name]?.host !== HOST || running[name]?.port !== port) {
      throw new Error(`Emulador ${name} recusado: esperado somente ${HOST}:${port}.`);
    }
  }
}

function createClient(name, withAuth = false) {
  const app = initializeApp({ apiKey: PROJECT_ID, projectId: PROJECT_ID }, `t17-${name}-${suffix}`);
  apps.push(app);
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, HOST, 8080);
  if (!withAuth) return { app, firestore, auth: null };
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  return { app, firestore, auth };
}

function memoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(CART_STORAGE_KEY, initialValue);
  return Object.freeze({
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  });
}

function exampleProducts() {
  return new Map([
    ["racao", Object.freeze({
      id: "racao",
      name: "Ração Premium",
      active: true,
      priceCents: 8_990
    })],
    ["petisco", Object.freeze({
      id: "petisco",
      name: "Petisco Natural",
      active: true,
      priceCents: 1_690
    })]
  ]);
}

function exampleItems() {
  return Object.freeze([
    Object.freeze({ productId: "racao", quantity: 2 }),
    Object.freeze({ productId: "petisco", quantity: 1 })
  ]);
}

async function scenario(label, action) {
  try {
    await action();
    passed += 1;
    console.log(`PASSOU: ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`FALHOU: ${label}`);
    console.error(error?.stack ?? error);
  }
}

requireLocalEnvironment();
await requireOfficialEmulators();

const publicClient = createClient("public");
const admin = createClient("admin", true);
const settingsService = createCheckoutSettingsService(publicClient.firestore);

try {
  await setPersistence(admin.auth, inMemoryPersistence);
  const credential = await signInWithEmailAndPassword(admin.auth, ADMIN.email, ADMIN.password);
  assert.equal(credential.user.uid, ADMIN.uid);

  await scenario("normaliza o destino e valida a configuração pública de modo estrito", async () => {
    assert.equal(normalizeWhatsappDigits("+55 (17) 99152-9090"), "5517991529090");
    assert.equal(normalizeWhatsappDigits("contato-5517991529090"), "");
    assert.equal(normalizeWhatsappDigits("123456789"), "");
    assert.equal(normalizeWhatsappDigits("1234567890123456"), "");
    assert.deepEqual(normalizeCheckoutSettings({
      whatsappDigits: "+55 (17) 99152-9090",
      whatsappGreeting: "  Olá!  "
    }), { whatsappDigits: "5517991529090", whatsappGreeting: "Olá!" });
    assert.throws(
      () => normalizeCheckoutSettings({ whatsappDigits: "", whatsappGreeting: "Olá" }),
      WhatsAppCheckoutValidationError
    );
    assert.throws(
      () => normalizeCheckoutSettings({ whatsappDigits: "5517991529090", whatsappGreeting: "" }),
      WhatsAppCheckoutValidationError
    );
  });

  await scenario("visitante lê somente a configuração pública necessária ao checkout", async () => {
    const settings = await settingsService.readPublicSettings();
    assert.deepEqual(settings, {
      whatsappDigits: "5517991529090",
      whatsappGreeting: "Olá! Quero finalizar meu pedido com a equipe AuFriends."
    });
    const snapshot = await getDocFromServer(
      doc(publicClient.firestore, "siteSettings", "public")
    );
    assert.equal(snapshot.exists(), true);
    assert.equal(snapshot.get("schemaVersion"), 1);
  });

  await scenario("resumo usa quantidades, centavos inteiros, unitários e subtotais atuais", async () => {
    const summary = createCheckoutSummary(exampleItems(), exampleProducts());
    assert.equal(summary.totalCents, 19_670);
    assert.equal(summary.totalLabel, "R$\u00a0196,70");
    assert.deepEqual(summary.items.map(({ unitPriceCents, subtotalCents }) => ({
      unitPriceCents,
      subtotalCents
    })), [
      { unitPriceCents: 8_990, subtotalCents: 17_980 },
      { unitPriceCents: 1_690, subtotalCents: 1_690 }
    ]);
    assert.deepEqual(summary.items.map(({ line }) => line), [
      "- Ração Premium — 2 × R$\u00a089,90 = R$\u00a0179,80",
      "- Petisco Natural — 1 × R$\u00a016,90 = R$\u00a016,90"
    ]);
  });

  await scenario("mensagem decodificada e destino wa.me correspondem exatamente ao resumo exibido", async () => {
    const checkout = buildWhatsAppCheckout({
      whatsappDigits: "5517991529090",
      whatsappGreeting: "Olá! Quero finalizar meu pedido com a equipe AuFriends."
    }, exampleItems(), exampleProducts());
    const expectedMessage = [
      "Olá! Quero finalizar meu pedido com a equipe AuFriends.",
      "",
      "Pedido AuFriends:",
      "- Ração Premium — 2 × R$\u00a089,90 = R$\u00a0179,80",
      "- Petisco Natural — 1 × R$\u00a016,90 = R$\u00a016,90",
      "",
      "Total: R$\u00a0196,70",
      "",
      "Quero combinar a entrega e o pagamento via Pix com a equipe AuFriends."
    ].join("\n");
    assert.equal(checkout.message, expectedMessage);
    assert.equal(new URL(checkout.url).origin, "https://wa.me");
    assert.equal(new URL(checkout.url).pathname, "/5517991529090");
    assert.equal(new URL(checkout.url).searchParams.get("text"), expectedMessage);
    assert.equal(
      decodeURIComponent(checkout.url.split("?text=")[1]),
      expectedMessage
    );
  });

  await scenario("carrinho vazio ou produto ausente, inativo ou inválido bloqueia a montagem", async () => {
    const settings = { whatsappDigits: "5517991529090", whatsappGreeting: "Olá" };
    assert.throws(
      () => buildWhatsAppCheckout(settings, [], exampleProducts()),
      WhatsAppCheckoutValidationError
    );
    assert.throws(
      () => buildWhatsAppCheckout(settings, [{ productId: "ausente", quantity: 1 }], exampleProducts()),
      WhatsAppCheckoutValidationError
    );
    const inactive = new Map([["inativo", {
      id: "inativo", name: "Inativo", active: false, priceCents: 100
    }]]);
    assert.throws(
      () => buildWhatsAppCheckout(settings, [{ productId: "inativo", quantity: 1 }], inactive),
      WhatsAppCheckoutValidationError
    );
    const invalidPrice = new Map([["preco", {
      id: "preco", name: "Preço inválido", active: true, priceCents: 1.5
    }]]);
    assert.throws(
      () => buildWhatsAppCheckout(settings, [{ productId: "preco", quantity: 1 }], invalidPrice),
      WhatsAppCheckoutValidationError
    );
  });

  await scenario("ação explícita abre uma única janela válida sem alterar o carrinho", async () => {
    const storage = memoryStorage(JSON.stringify(exampleItems()));
    const store = createCartStore(storage);
    const checkout = buildWhatsAppCheckout({
      whatsappDigits: "5517991529090",
      whatsappGreeting: "Olá"
    }, store.getItems(), exampleProducts());
    const before = storage.values.get(CART_STORAGE_KEY);
    const calls = [];
    let navigatedTo = null;
    const popup = {
      opener: {},
      location: { replace: (url) => { navigatedTo = url; } },
      close() {}
    };
    const result = openWhatsAppCheckout((url, target) => {
      calls.push([url, target]);
      return popup;
    }, checkout.url);
    assert.deepEqual(result, { opened: true, reason: null });
    assert.deepEqual(calls, [["about:blank", "_blank"]]);
    assert.equal(navigatedTo, checkout.url);
    assert.equal(popup.opener, null);
    assert.equal(storage.values.get(CART_STORAGE_KEY), before);
  });

  await scenario("popup bloqueado retorna estado verificável e mantém o carrinho", async () => {
    const storage = memoryStorage(JSON.stringify(exampleItems()));
    const store = createCartStore(storage);
    const checkout = buildWhatsAppCheckout({
      whatsappDigits: "5517991529090",
      whatsappGreeting: "Olá"
    }, store.getItems(), exampleProducts());
    const before = storage.values.get(CART_STORAGE_KEY);
    assert.deepEqual(
      openWhatsAppCheckout(() => null, checkout.url),
      { opened: false, reason: "blocked" }
    );
    assert.deepEqual(
      openWhatsAppCheckout(() => { throw new Error("bloqueado"); }, checkout.url),
      { opened: false, reason: "blocked" }
    );
    assert.equal(storage.values.get(CART_STORAGE_KEY), before);
  });

  await scenario("destino inválido é recusado antes de qualquer tentativa de abertura", async () => {
    let calls = 0;
    assert.throws(
      () => openWhatsAppCheckout(() => { calls += 1; }, "https://example.com/5517991529090?text=Olá"),
      WhatsAppCheckoutValidationError
    );
    assert.throws(
      () => openWhatsAppCheckout(() => { calls += 1; }, "javascript:alert(1)"),
      WhatsAppCheckoutValidationError
    );
    assert.equal(calls, 0);
  });

  await scenario("consulta pública usa somente produtos ativos, ordenados e preços correntes", async () => {
    const snapshot = await getDocs(query(
      collection(publicClient.firestore, "products"),
      where("active", "==", true),
      orderBy("sortOrder", "asc")
    ));
    const products = snapshot.docs.map((item) => Object.freeze({ id: item.id, ...item.data() }));
    assert.equal(products.length, T11_PRODUCTS.length);
    assert.deepEqual(products.map(({ id }) => id), T11_PRODUCTS.map(({ id }) => id));
    assert.ok(products.every(({ active }) => active === true));
    assert.ok(products.every((product, index) =>
      index === 0 || products[index - 1].sortOrder <= product.sortOrder
    ));
    const reconciliation = reconcileCartItems([
      { productId: products[0].id, quantity: 2 },
      { productId: "produto-ausente", quantity: 9 }
    ], new Set(products.map(({ id }) => id)));
    assert.deepEqual(reconciliation.kept, [{ productId: products[0].id, quantity: 2 }]);
    assert.deepEqual(reconciliation.removed, [{ productId: "produto-ausente", quantity: 9 }]);
  });

  await scenario("HTML e módulo expõem prévia e estados acessíveis com abertura somente no clique", async () => {
    const html = readFileSync("web/carrinho/index.html", "utf8");
    const feature = readFileSync("web/src/features/cart-page.js", "utf8");
    const served = await fetch(HOSTING_CART_URL, { signal: AbortSignal.timeout(3_000) });
    assert.equal(served.ok, true);
    const servedHtml = await served.text();
    for (const marker of [
      "data-cart-checkout",
      "data-checkout-preview",
      "data-checkout-message",
      "data-checkout-status",
      "aria-live=\"polite\""
    ]) {
      assert.ok(html.includes(marker));
      assert.ok(servedHtml.includes(marker));
    }
    assert.equal(html.includes("Finalizar compra — disponível na T17"), false);
    assert.match(feature, /checkoutMessage\.textContent = preparedCheckout\.message/);
    const clickStart = feature.indexOf("checkoutButton.addEventListener(\"click\"");
    const openAt = feature.indexOf("openWhatsAppCheckout(", clickStart);
    assert.ok(clickStart >= 0 && openAt > clickStart);
    assert.equal((feature.match(/openWhatsAppCheckout\(/g) ?? []).length, 1);
  });

  await scenario("checkout não grava pedido, pagamento, estoque nem dados do carrinho", async () => {
    const serviceSource = readFileSync("web/src/services/whatsapp-checkout.js", "utf8");
    const feature = readFileSync("web/src/features/cart-page.js", "utf8");
    const clickBlock = feature.slice(
      feature.indexOf("checkoutButton.addEventListener(\"click\""),
      feature.indexOf("void Promise.all")
    );
    assert.doesNotMatch(serviceSource, /\b(?:addDoc|setDoc|updateDoc|deleteDoc|uploadBytes)\b/);
    assert.doesNotMatch(serviceSource, /\b(?:orders|inventory|stock|gateway|qrCode|pixKey)\b/i);
    assert.doesNotMatch(clickBlock, /cartStore\.(?:clear|remove|removeMany|setQuantity|add|increment|decrement)\b/);
    assert.match(clickBlock, /Seu carrinho foi mantido/);
  });

  await scenario("estado compartilhado permanece com fixtures aceitas e nenhuma submissão", async () => {
    const [products, animals, requests, donations, settings] = await Promise.all([
      getDocs(collection(admin.firestore, "products")),
      getDocs(collection(admin.firestore, "animals")),
      getDocs(collection(admin.firestore, "adoptionRequests")),
      getDocs(collection(admin.firestore, "donations")),
      getDocFromServer(doc(admin.firestore, "siteSettings", "public"))
    ]);
    assert.equal(products.size, 7);
    assert.equal(animals.size, 3);
    assert.equal(requests.size, 0);
    assert.equal(donations.size, 0);
    assert.equal(settings.get("whatsappDigits"), "5517991529090");
    assert.equal(settings.get("whatsappGreeting"), "Olá! Quero finalizar meu pedido com a equipe AuFriends.");
  });
} finally {
  await signOut(admin.auth).catch(() => {});
  await Promise.all(apps.map((app) => deleteApp(app)));
}

const total = passed + failed;
console.log(`Resultado T17: ${passed}/${total} cenários aprovados; ${failed} falhos.`);
console.log("Estado esperado: carrinho preservado, 7 produtos, 3 animais e nenhuma submissão temporária.");
if (failed > 0) process.exitCode = 1;
