import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import {
  connectStorageEmulator,
  deleteObject,
  getStorage,
  ref,
  uploadBytes
} from "firebase/storage";
import { T07_USERS } from "./admin-auth.mjs";
import {
  LOCAL_FIREBASE_CONFIG,
  LOCAL_HOST,
  LOCAL_PORTS,
  LOCAL_PROJECT_ID,
  resolveLocalPreflight
} from "./local-emulator-environment.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const T11_PRODUCTS = Object.freeze([
  Object.freeze({
    id: "t11-racao-premium",
    imageFile: "racao-premium.jpg",
    imageType: "image/jpeg",
    imagePath: "public/products/t11-racao-premium/41000000-0000-4000-8000-000000000001.jpg",
    name: "Ração Premium",
    description: "Alimentação completa e saudável para cachorros de todas as idades.",
    category: "food",
    priceCents: 8_990,
    compareAtPriceCents: 9_990,
    badge: "Mais vendido",
    sortOrder: 10,
    imageAlt: "Ração Premium"
  }),
  Object.freeze({
    id: "t11-brinquedo-mordedor",
    imageFile: "brinquedo-mordedor.jpg",
    imageType: "image/jpeg",
    imagePath: "public/products/t11-brinquedo-mordedor/42000000-0000-4000-8000-000000000002.jpg",
    name: "Brinquedo Mordedor",
    description: "Ideal para diversão, entretenimento e saúde dos dentes do seu pet.",
    category: "toys",
    priceCents: 2_490,
    compareAtPriceCents: 3_490,
    badge: "Promoção",
    sortOrder: 20,
    imageAlt: "Brinquedo Mordedor"
  }),
  Object.freeze({
    id: "t11-coleira-ajustavel",
    imageFile: "coleira.jpg",
    imageType: "image/jpeg",
    imagePath: "public/products/t11-coleira-ajustavel/43000000-0000-4000-8000-000000000003.jpg",
    name: "Coleira Ajustável",
    description: "Conforto e segurança para os passeios do dia a dia com seu cachorro.",
    category: "accessories",
    priceCents: 3_590,
    compareAtPriceCents: 4_590,
    badge: "Destaque",
    sortOrder: 30,
    imageAlt: "Coleira Ajustável"
  }),
  Object.freeze({
    id: "t11-shampoo-pet",
    imageFile: "shampoo.jpg",
    imageType: "image/jpeg",
    imagePath: "public/products/t11-shampoo-pet/44000000-0000-4000-8000-000000000004.jpg",
    name: "Shampoo Pet",
    description: "Higiene, limpeza e cuidado especial para deixar seu pet cheiroso.",
    category: "hygiene",
    priceCents: 1_990,
    compareAtPriceCents: 2_990,
    badge: "Oferta",
    sortOrder: 40,
    imageAlt: "Shampoo Pet"
  }),
  Object.freeze({
    id: "t11-caminha-fofinha",
    imageFile: "caminha-fofinha.jpg",
    imageType: "image/jpeg",
    imagePath: "public/products/t11-caminha-fofinha/45000000-0000-4000-8000-000000000005.jpg",
    name: "Caminha Fofinha",
    description: "Uma cama macia e confortável para o descanso do seu melhor amigo.",
    category: "accessories",
    priceCents: 11_990,
    compareAtPriceCents: 13_990,
    badge: "Conforto",
    sortOrder: 50,
    imageAlt: "Caminha para cachorro"
  }),
  Object.freeze({
    id: "t11-petisco-natural",
    imageFile: "petiscos.jpg",
    imageType: "image/jpeg",
    imagePath: "public/products/t11-petisco-natural/46000000-0000-4000-8000-000000000006.jpg",
    name: "Petisco Natural",
    description: "Snack saboroso para recompensar seu cão com muito carinho.",
    category: "treats",
    priceCents: 1_690,
    compareAtPriceCents: 2_290,
    badge: "Novo",
    sortOrder: 60,
    imageAlt: "Petisco Natural"
  }),
  Object.freeze({
    id: "t11-roupinha",
    imageFile: "roupa-femea.png",
    imageType: "image/png",
    imagePath: "public/products/t11-roupinha/47000000-0000-4000-8000-000000000007.png",
    name: "Roupinha",
    description: "Roupinha confortável e quentinha.",
    category: "clothing",
    priceCents: 4_990,
    compareAtPriceCents: 5_990,
    badge: "Fofo",
    sortOrder: 70,
    imageAlt: "Roupinha de Inverno"
  })
]);

export async function applyProductsFixture({
  preflight,
  removePreviousMedia = true,
  quiet = false
} = {}) {
  await resolveLocalPreflight(preflight);

  const app = initializeApp(
    LOCAL_FIREBASE_CONFIG,
    `t11-products-fixture-${crypto.randomUUID()}`
  );
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const storage = getStorage(app);
  connectAuthEmulator(auth, `http://${LOCAL_HOST}:${LOCAL_PORTS.auth}`, {
    disableWarnings: true
  });
  connectFirestoreEmulator(firestore, LOCAL_HOST, LOCAL_PORTS.firestore);
  connectStorageEmulator(storage, LOCAL_HOST, LOCAL_PORTS.storage);

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      T07_USERS.admin.email,
      T07_USERS.admin.password
    );
    if (credential.user.uid !== T07_USERS.admin.uid) {
      throw new Error("Conta administrativa local não corresponde ao UID fixo esperado.");
    }
    for (const product of T11_PRODUCTS) {
      const documentReference = doc(firestore, "products", product.id);
      const current = await getDocFromServer(documentReference);
      const previousPath = current.exists() ? current.get("imagePath") : null;
      const image = await readFile(resolve(projectRoot, "web/assets/img", product.imageFile));

      await uploadBytes(ref(storage, product.imagePath), image, { contentType: product.imageType });
      try {
        await setDoc(documentReference, {
          schemaVersion: 1,
          name: product.name,
          description: product.description,
          category: product.category,
          priceCents: product.priceCents,
          compareAtPriceCents: product.compareAtPriceCents,
          badge: product.badge,
          active: true,
          sortOrder: product.sortOrder,
          imagePath: product.imagePath,
          imageAlt: product.imageAlt,
          createdAt: current.exists() ? current.get("createdAt") : serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: credential.user.uid
        }, { merge: false });
      } catch (error) {
        if (previousPath !== product.imagePath) {
          await deleteObject(ref(storage, product.imagePath)).catch(() => {});
        }
        throw error;
      }

      if (removePreviousMedia && previousPath && previousPath !== product.imagePath) {
        await deleteObject(ref(storage, previousPath)).catch((error) => {
          if (error?.code !== "storage/object-not-found") throw error;
        });
      }
    }

    if (!quiet) {
      console.log(
        `Fixture T11 aplicada em ${LOCAL_PROJECT_ID}: ${T11_PRODUCTS.length} produtos ativos e mídias fixas.`
      );
      console.log("A fixture é local, idempotente, usa os sete assets existentes e não toca em outras coleções.");
    }
    return Object.freeze({
      ids: Object.freeze(T11_PRODUCTS.map(({ id }) => id)),
      imagePaths: Object.freeze(T11_PRODUCTS.map(({ imagePath }) => imagePath))
    });
  } finally {
    await signOut(auth).catch(() => {});
    await deleteApp(app);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await applyProductsFixture();
}
