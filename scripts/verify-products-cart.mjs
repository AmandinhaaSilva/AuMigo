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
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import {
  connectStorageEmulator,
  deleteObject,
  getMetadata,
  getStorage,
  ref,
  uploadBytes
} from "firebase/storage";
import { T11_PRODUCTS } from "./fixtures/products-t11.mjs";
import {
  CART_CHANGE_EVENT,
  CART_STORAGE_KEY,
  CartValidationError,
  calculateCartTotalCents,
  createCartStore,
  reconcileCartItems,
  sanitizeCartItems
} from "../web/src/services/cart-store.js";
import {
  ProductDataValidationError,
  createProductsDataService,
  filterPublicProducts,
  formatBRL,
  hasValidCompareAtPrice,
  normalizeProductInput,
  optimizeProductImage,
  parseBRLToCents,
  validateProductImageFile
} from "../web/src/services/products-data.js";

const PROJECT_ID = "demo-aufriends-local";
const HOST = "127.0.0.1";
const HUB_URL = `http://${HOST}:4400/emulators`;
const BUCKET = `${PROJECT_ID}.appspot.com`;
const ADMIN = Object.freeze({
  uid: "local-admin-aufriends",
  email: "admin@aufriends.local",
  password: "AuFriendsLocal!2026"
});
const NON_ADMIN = Object.freeze({
  uid: "local-user-aufriends",
  email: "usuario@aufriends.local",
  password: "UsuarioLocal!2026"
});
const suffix = crypto.randomUUID().toLowerCase();
const deniedImagePath = `public/products/t11-denied-${suffix}/${crypto.randomUUID().toLowerCase()}.png`;
const temporaryPaths = new Set([deniedImagePath]);
const apps = [];
let temporaryProduct = null;
let temporaryProductId = null;
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
  for (const [name, port] of Object.entries({ auth: 9099, firestore: 8080, storage: 9199 })) {
    if (running[name]?.host !== HOST || running[name]?.port !== port) {
      throw new Error(`Emulador ${name} recusado: esperado somente ${HOST}:${port}.`);
    }
  }
}

function createClient(name, withAuth = false) {
  const app = initializeApp({
    apiKey: PROJECT_ID,
    projectId: PROJECT_ID,
    storageBucket: BUCKET
  }, `t11-${name}-${suffix}`);
  apps.push(app);
  const firestore = getFirestore(app);
  const storage = getStorage(app);
  connectFirestoreEmulator(firestore, HOST, 8080);
  connectStorageEmulator(storage, HOST, 9199);
  if (!withAuth) return { app, firestore, storage, auth: null };
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  return { app, firestore, storage, auth };
}

function testFile(contentType, name, bytes) {
  const content = Uint8Array.from(bytes);
  return Object.freeze({
    name,
    type: contentType,
    size: content.byteLength,
    async arrayBuffer() {
      return content.slice().buffer;
    }
  });
}

function validProductInput(overrides = {}) {
  return {
    name: "Produto temporário T11",
    description: "Produto fictício criado somente durante a verificação automatizada local T11.",
    category: "toys",
    priceReais: "42,90",
    compareAtPriceReais: "49,90",
    badge: "Teste local",
    active: true,
    sortOrder: 9_900,
    imageAlt: "Produto temporário da verificação T11",
    ...overrides
  };
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

function currentDocument(snapshot) {
  assert.equal(snapshot.exists(), true);
  return Object.freeze({ id: snapshot.id, ...snapshot.data() });
}

function isDenied(error) {
  return /permission-denied|unauthorized/i.test(String(error?.code ?? error?.message));
}

function isMissingObject(error) {
  return /object-not-found/i.test(String(error?.code ?? error?.message));
}

async function expectDenied(operation) {
  await assert.rejects(operation, isDenied);
}

async function removeIfPresent(operation) {
  try {
    await operation();
  } catch (error) {
    if (!isMissingObject(error)) throw error;
  }
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

const admin = createClient("admin", true);
const nonAdmin = createClient("non-admin", true);
const publicClient = createClient("public");
const adminService = createProductsDataService(admin.firestore, admin.storage);
const nonAdminService = createProductsDataService(nonAdmin.firestore, nonAdmin.storage);
const publicService = createProductsDataService(publicClient.firestore, publicClient.storage);
const firstImage = testFile("image/png", "produto.png", [137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const replacementImage = testFile("image/webp", "produto.webp", [82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);

try {
  await Promise.all([
    setPersistence(admin.auth, inMemoryPersistence),
    setPersistence(nonAdmin.auth, inMemoryPersistence)
  ]);
  const [adminCredential, nonAdminCredential] = await Promise.all([
    signInWithEmailAndPassword(admin.auth, ADMIN.email, ADMIN.password),
    signInWithEmailAndPassword(nonAdmin.auth, NON_ADMIN.email, NON_ADMIN.password)
  ]);
  assert.equal(adminCredential.user.uid, ADMIN.uid);
  assert.equal(nonAdminCredential.user.uid, NON_ADMIN.uid);

  await scenario("normaliza valores monetários, campos e imagens de modo estrito", async () => {
    assert.equal(parseBRLToCents("89,90"), 8_990);
    assert.equal(parseBRLToCents("30.01"), 3_001);
    assert.equal(parseBRLToCents("0"), 0);
    for (const invalid of ["1.000,00", "-1,00", "+1,00", "1,234", "1,2,3", ""]) {
      assert.equal(Number.isNaN(parseBRLToCents(invalid)), true);
    }
    assert.equal(formatBRL(8_990), "R$ 89,90");
    assert.equal(normalizeProductInput(validProductInput()).valid, true);
    assert.equal(normalizeProductInput(validProductInput({ priceReais: "1.000,00" })).valid, false);
    assert.equal(normalizeProductInput(validProductInput({ category: "pix" })).valid, false);
    assert.equal(validateProductImageFile(firstImage).valid, true);
    assert.equal(validateProductImageFile(testFile("image/svg+xml", "produto.svg", [1])).valid, false);
    assert.equal(validateProductImageFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 }).valid, false);
    assert.equal(await optimizeProductImage(firstImage), firstImage);
    assert.ok(readFileSync("web/src/services/products-data.js", "utf8").includes("1_600"));
  });

  await scenario("aplica filtros locais nas fronteiras e exibe comparativo somente quando maior", async () => {
    const products = [
      { id: "a", category: "food", priceCents: 3_000 },
      { id: "b", category: "food", priceCents: 3_001 },
      { id: "c", category: "toys", priceCents: 8_000 },
      { id: "d", category: "toys", priceCents: 8_001 }
    ];
    assert.deepEqual(filterPublicProducts(products, { price: "up-to-3000" }).map(({ id }) => id), ["a"]);
    assert.deepEqual(filterPublicProducts(products, { price: "3001-8000" }).map(({ id }) => id), ["b", "c"]);
    assert.deepEqual(filterPublicProducts(products, { price: "over-8000" }).map(({ id }) => id), ["d"]);
    assert.deepEqual(filterPublicProducts(products, { category: "food" }).map(({ id }) => id), ["a", "b"]);
    assert.equal(hasValidCompareAtPrice({ priceCents: 100, compareAtPriceCents: 101 }), true);
    assert.equal(hasValidCompareAtPrice({ priceCents: 100, compareAtPriceCents: 100 }), false);
    assert.equal(hasValidCompareAtPrice({ priceCents: 100, compareAtPriceCents: 99 }), false);
    assert.equal(hasValidCompareAtPrice({ priceCents: 100, compareAtPriceCents: null }), false);
  });

  await scenario("carrinho saneia corrupção, duplicatas, campos extras e limite", async () => {
    const dirty = JSON.stringify([
      { productId: "produto-a", quantity: 60, name: "não deve persistir", priceCents: 1 },
      { productId: "produto-a", quantity: 60 },
      { productId: "../invalido", quantity: 1 },
      { productId: "produto-b", quantity: 0 },
      { productId: "produto-c", quantity: 100 }
    ]);
    const storage = memoryStorage(dirty);
    const store = createCartStore(storage);
    assert.deepEqual(store.getItems(), [{ productId: "produto-a", quantity: 99 }]);
    assert.equal(storage.values.get(CART_STORAGE_KEY), JSON.stringify([{ productId: "produto-a", quantity: 99 }]));
    assert.deepEqual(sanitizeCartItems({ items: [] }), []);
  });

  await scenario("carrinho adiciona, incrementa, reduz, define, remove, esvazia e emite eventos", async () => {
    const storage = memoryStorage();
    const target = new EventTarget();
    const store = createCartStore(storage, target);
    let events = 0;
    target.addEventListener(CART_CHANGE_EVENT, () => events += 1);
    store.add("produto-a", 2);
    store.increment("produto-a");
    store.decrement("produto-a");
    store.setQuantity("produto-a", 99);
    assert.equal(store.increment("produto-a"), false);
    assert.throws(() => store.setQuantity("produto-a", 0), CartValidationError);
    store.add("produto-b");
    store.remove("produto-b");
    assert.deepEqual(JSON.parse(storage.values.get(CART_STORAGE_KEY)), [{ productId: "produto-a", quantity: 99 }]);
    store.clear();
    assert.deepEqual(store.getItems(), []);
    assert.equal(events, 7);
  });

  await scenario("carrinho sincroniza evento storage entre abas", async () => {
    const storage = memoryStorage();
    const target = new EventTarget();
    const store = createCartStore(storage, target);
    let source = null;
    store.subscribe((detail) => { source = detail.source; });
    const newValue = JSON.stringify([{ productId: "produto-remoto", quantity: 3 }]);
    storage.setItem(CART_STORAGE_KEY, newValue);
    const event = new Event("storage");
    Object.defineProperties(event, {
      key: { value: CART_STORAGE_KEY },
      newValue: { value: newValue }
    });
    target.dispatchEvent(event);
    assert.deepEqual(store.getItems(), [{ productId: "produto-remoto", quantity: 3 }]);
    assert.equal(source, "storage");
  });

  await scenario("total usa centavos inteiros e indisponíveis são reconciliados antes da soma", async () => {
    const items = [
      { productId: "racao", quantity: 2 },
      { productId: "petisco", quantity: 1 },
      { productId: "inativo", quantity: 7 }
    ];
    const reconciliation = reconcileCartItems(items, new Set(["racao", "petisco"]));
    assert.deepEqual(reconciliation.removed, [{ productId: "inativo", quantity: 7 }]);
    const products = new Map([
      ["racao", { priceCents: 8_990 }],
      ["petisco", { priceCents: 1_690 }]
    ]);
    assert.equal(calculateCartTotalCents(reconciliation.kept, products), 19_670);
    assert.throws(() => calculateCartTotalCents(items, products), CartValidationError);
  });

  await scenario("HTML integra catálogo, badge e carrinho preservando a fundação T11", async () => {
    const shopHtml = readFileSync("web/loja/index.html", "utf8");
    const cartHtml = readFileSync("web/carrinho/index.html", "utf8");
    const panelHtml = readFileSync("web/admin/painel/index.html", "utf8");
    const shell = readFileSync("web/src/components/site-shell.js", "utf8");
    const catalog = readFileSync("web/src/features/products-catalog.js", "utf8");
    const cart = readFileSync("web/src/features/cart-page.js", "utf8");
    assert.ok(shopHtml.includes("data-product-grid"));
    assert.ok(shopHtml.includes("data-product-price=\"3001-8000\""));
    assert.equal(shopHtml.includes("product-card__installment"), false);
    assert.ok(shell.includes("data-cart-badge"));
    assert.ok(cartHtml.includes("data-cart-checkout"));
    assert.match(cartHtml, /data-cart-checkout\s+disabled/);
    assert.ok(panelHtml.includes("data-admin-products-list"));
    assert.ok(catalog.includes("textContent"));
    assert.ok(cart.includes("textContent"));
    assert.equal(/\b(?:addDoc|setDoc|updateDoc|deleteDoc)\b/.test(cart), false);
  });

  await scenario("fixture mantém sete produtos e sete mídias com o conteúdo do baseline", async () => {
    const listed = await adminService.listAdminProducts();
    assert.equal(listed.length, T11_PRODUCTS.length);
    assert.deepEqual(listed.map(({ id }) => id), T11_PRODUCTS.map(({ id }) => id));
    for (const expected of T11_PRODUCTS) {
      const product = listed.find(({ id }) => id === expected.id);
      assert.ok(product);
      for (const field of [
        "name", "description", "category", "priceCents", "compareAtPriceCents",
        "badge", "sortOrder", "imagePath", "imageAlt"
      ]) {
        assert.equal(product[field], expected[field]);
      }
      assert.equal(product.active, true);
      assert.equal(product.schemaVersion, 1);
      const metadata = await getMetadata(ref(publicClient.storage, expected.imagePath));
      assert.equal(metadata.contentType, expected.imageType);
      assert.ok(metadata.size > 0);
    }
  });

  await scenario("administrador cria produto e mídia válidos", async () => {
    const created = await adminService.saveProduct(ADMIN.uid, validProductInput(), { imageFile: firstImage });
    temporaryProductId = created.id;
    temporaryPaths.add(created.imagePath);
    temporaryProduct = currentDocument(await getDocFromServer(doc(admin.firestore, "products", created.id)));
    assert.equal(temporaryProduct.schemaVersion, 1);
    assert.equal(temporaryProduct.priceCents, 4_290);
    assert.equal(temporaryProduct.compareAtPriceCents, 4_990);
    assert.equal(temporaryProduct.updatedBy, ADMIN.uid);
    assert.equal(temporaryProduct.imagePath, created.imagePath);
  });

  await scenario("mídia é pública e consulta retorna somente ativos ordenados com filtros", async () => {
    const metadata = await getMetadata(ref(publicClient.storage, temporaryProduct.imagePath));
    assert.equal(metadata.contentType, "image/png");
    const products = await publicService.listPublicProducts();
    assert.ok(products.some(({ id }) => id === temporaryProduct.id));
    assert.ok(products.every(({ active }) => active === true));
    assert.ok(products.every((product, index) => index === 0 || products[index - 1].sortOrder <= product.sortOrder));
    assert.deepEqual(
      filterPublicProducts(T11_PRODUCTS, { category: "food" }).map(({ id }) => id),
      ["t11-racao-premium"]
    );
    assert.deepEqual(
      filterPublicProducts(T11_PRODUCTS, { price: "up-to-3000" }).map(({ id }) => id),
      ["t11-brinquedo-mordedor", "t11-shampoo-pet", "t11-petisco-natural"]
    );
  });

  await scenario("produto inativo some do público e volta ao ser ativado", async () => {
    await adminService.setProductActive(ADMIN.uid, temporaryProduct, false);
    await expectDenied(getDocFromServer(doc(publicClient.firestore, "products", temporaryProduct.id)));
    assert.equal((await publicService.listPublicProducts()).some(({ id }) => id === temporaryProduct.id), false);
    temporaryProduct = currentDocument(
      await getDocFromServer(doc(admin.firestore, "products", temporaryProduct.id))
    );
    await adminService.setProductActive(ADMIN.uid, temporaryProduct, true);
    temporaryProduct = currentDocument(
      await getDocFromServer(doc(admin.firestore, "products", temporaryProduct.id))
    );
    assert.equal(temporaryProduct.active, true);
  });

  await scenario("usuário autenticado não admin não recebe catálogo administrativo nem escrita", async () => {
    await expectDenied(nonAdminService.listAdminProducts());
    await expectDenied(nonAdminService.setProductActive(NON_ADMIN.uid, temporaryProduct, false));
    await expectDenied(nonAdminService.deleteProduct(NON_ADMIN.uid, temporaryProduct));
    await expectDenied(uploadBytes(ref(nonAdmin.storage, deniedImagePath), new Uint8Array([1]), {
      contentType: "image/png"
    }));
  });

  await scenario("administrador edita campos e createdAt permanece imutável", async () => {
    const createdAt = temporaryProduct.createdAt.toMillis();
    await expectDenied(updateDoc(doc(admin.firestore, "products", temporaryProduct.id), {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: ADMIN.uid
    }));
    await adminService.saveProduct(ADMIN.uid, validProductInput({
      name: "Produto temporário editado",
      priceReais: "30,01",
      compareAtPriceReais: "",
      badge: "",
      active: true,
      sortOrder: 9_901
    }), { current: temporaryProduct });
    temporaryProduct = currentDocument(
      await getDocFromServer(doc(admin.firestore, "products", temporaryProduct.id))
    );
    assert.equal(temporaryProduct.name, "Produto temporário editado");
    assert.equal(temporaryProduct.priceCents, 3_001);
    assert.equal(temporaryProduct.compareAtPriceCents, null);
    assert.equal(temporaryProduct.createdAt.toMillis(), createdAt);
  });

  await scenario("substituição salva o documento antes de limpar a mídia anterior", async () => {
    const previousPath = temporaryProduct.imagePath;
    const outcome = await adminService.saveProduct(ADMIN.uid, validProductInput({
      name: "Produto temporário com nova imagem"
    }), { current: temporaryProduct, imageFile: replacementImage });
    temporaryPaths.add(outcome.imagePath);
    temporaryProduct = currentDocument(
      await getDocFromServer(doc(admin.firestore, "products", temporaryProduct.id))
    );
    assert.equal(temporaryProduct.imagePath, outcome.imagePath);
    assert.notEqual(temporaryProduct.imagePath, previousPath);
    await assert.rejects(getMetadata(ref(admin.storage, previousPath)), isMissingObject);
    assert.equal((await getMetadata(ref(publicClient.storage, outcome.imagePath))).contentType, "image/webp");
  });

  await scenario("administrador exclui produto e mídia", async () => {
    const id = temporaryProduct.id;
    const imagePath = temporaryProduct.imagePath;
    const outcome = await adminService.deleteProduct(ADMIN.uid, temporaryProduct);
    assert.equal(outcome.warning, null);
    assert.equal((await getDocFromServer(doc(admin.firestore, "products", id))).exists(), false);
    await assert.rejects(getMetadata(ref(admin.storage, imagePath)), isMissingObject);
    temporaryProduct = null;
    temporaryProductId = null;
  });

  await scenario("fixture e estado T09/T10 permanecem íntegros", async () => {
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
    assert.equal(settings.get("whatsappGreeting"), "Olá! Quero finalizar meu pedido com a equipe AuFriends.");
    for (const animal of animals.docs) {
      await getMetadata(ref(admin.storage, animal.get("imagePath")));
    }
  });
} finally {
  const cleanupErrors = [];
  if (admin.auth.currentUser) {
    if (temporaryProductId) {
      try {
        await deleteDoc(doc(admin.firestore, "products", temporaryProductId));
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const path of temporaryPaths) {
      try {
        await removeIfPresent(() => deleteObject(ref(admin.storage, path)));
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      const products = await getDocs(collection(admin.firestore, "products"));
      if (products.size !== T11_PRODUCTS.length) {
        cleanupErrors.push(new Error(`Esperados 7 produtos fixos; encontrados ${products.size}.`));
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  await Promise.all([
    signOut(admin.auth).catch(() => {}),
    signOut(nonAdmin.auth).catch(() => {})
  ]);
  await Promise.all(apps.map((app) => deleteApp(app)));

  if (cleanupErrors.length === 0) {
    passed += 1;
    console.log("PASSOU: limpeza removeu produto e mídias efêmeros e preservou os sete itens fixos.");
  } else {
    failed += 1;
    console.error(`FALHOU: limpeza encontrou ${cleanupErrors.length} erro(s).`);
  }
}

const total = passed + failed;
console.log(`Resultado T11: ${passed}/${total} cenários aprovados; ${failed} falhos.`);
console.log("Estado esperado: 7 produtos fixos, 7 mídias de produto, 3 animais e nenhuma submissão temporária.");
if (failed > 0) process.exitCode = 1;
