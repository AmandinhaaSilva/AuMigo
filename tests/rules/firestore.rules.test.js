import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { createFirestoreTestEnvironment, seedFirestore } from "./helpers.js";

const ACTIVE_ADMIN_UID = "admin-active";
const INACTIVE_ADMIN_UID = "admin-inactive";
const NON_ADMIN_UID = "authenticated-non-admin";
const MEDIA_UUID = "123e4567-e89b-42d3-a456-426614174000";
const FIXED_TIME = Timestamp.fromMillis(1790985600000);

let testEnvironment;

function storedAdmin(uid, active) {
  return {
    schemaVersion: 1,
    displayName: active ? "Admin ativo" : "Admin inativo",
    email: `${uid}@aufriends.local`,
    active,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME
  };
}

function storedAnimal(animalId = "animal-one", overrides = {}) {
  return {
    schemaVersion: 1,
    name: "Luna",
    species: "dog",
    breed: "Sem raça definida",
    ageMonths: 24,
    sex: "female",
    size: "medium",
    color: "caramelo",
    description: "Animal sociável disponível para adoção.",
    adoptionStatus: "available",
    published: true,
    sortOrder: 1,
    imagePath: `public/animals/${animalId}/${MEDIA_UUID}.webp`,
    imageAlt: "Cadela Luna",
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    updatedBy: ACTIVE_ADMIN_UID,
    ...overrides
  };
}

function writableAnimal(animalId, uid = ACTIVE_ADMIN_UID, overrides = {}) {
  return {
    ...storedAnimal(animalId),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    ...overrides
  };
}

function storedProduct(productId = "product-one", overrides = {}) {
  return {
    schemaVersion: 1,
    name: "Ração Premium",
    description: "Alimento completo para cães adultos.",
    category: "food",
    priceCents: 8990,
    compareAtPriceCents: null,
    badge: "",
    active: true,
    sortOrder: 1,
    imagePath: `public/products/${productId}/${MEDIA_UUID}.webp`,
    imageAlt: "Pacote de ração premium",
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    updatedBy: ACTIVE_ADMIN_UID,
    ...overrides
  };
}

function writableProduct(productId, uid = ACTIVE_ADMIN_UID, overrides = {}) {
  return {
    ...storedProduct(productId),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    ...overrides
  };
}

function storedAdoption(animalId = "animal-one", overrides = {}) {
  return {
    schemaVersion: 1,
    animalId,
    fullName: "Pessoa Interessada",
    email: "pessoa@example.test",
    phoneE164: "+5517999999999",
    city: "São José do Rio Preto",
    state: "SP",
    message: "Gostaria de conhecer o animal.",
    privacyConsent: true,
    status: "pending",
    adminNotes: "",
    handledBy: null,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides
  };
}

function writableAdoption(animalId = "animal-one", overrides = {}) {
  return {
    ...storedAdoption(animalId),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides
  };
}

function storedDonation(overrides = {}) {
  return {
    schemaVersion: 1,
    fullName: "Pessoa Doadora",
    email: "doador@example.test",
    phoneE164: "",
    type: "food",
    amountOrQuantity: "10 kg de ração",
    deliveryMethod: "dropoff",
    message: "Posso entregar durante a semana.",
    privacyConsent: true,
    status: "received",
    adminNotes: "",
    handledBy: null,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides
  };
}

function writableDonation(overrides = {}) {
  return {
    ...storedDonation(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides
  };
}

function settingsData(uid = ACTIVE_ADMIN_UID, overrides = {}) {
  return {
    schemaVersion: 1,
    brandName: "AuFriends",
    whatsappDigits: "5517999999999",
    whatsappGreeting: "Olá! Quero falar com a equipe AuFriends.",
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    ...overrides
  };
}

function unauthenticatedDatabase() {
  return testEnvironment.unauthenticatedContext().firestore();
}

function authenticatedDatabase(uid) {
  return testEnvironment.authenticatedContext(uid, {
    email: `${uid}@aufriends.local`
  }).firestore();
}

before(async () => {
  testEnvironment = await createFirestoreTestEnvironment();
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
});

after(async () => {
  if (testEnvironment) {
    await testEnvironment.clearFirestore();
    await testEnvironment.cleanup();
  }
});

test("visitante lê animal publicado, mas não oculto nem lista sem filtro", async () => {
  await seedFirestore(testEnvironment, {
    "animals/public-animal": storedAnimal("public-animal"),
    "animals/hidden-animal": storedAnimal("hidden-animal", { published: false })
  });
  const database = unauthenticatedDatabase();

  const snapshot = await assertSucceeds(getDoc(doc(database, "animals/public-animal")));
  assert.equal(snapshot.data().name, "Luna");
  await assertFails(getDoc(doc(database, "animals/hidden-animal")));
  await assertFails(getDocs(collection(database, "animals")));
});

test("visitante lê produto ativo, mas não inativo nem lista sem filtro", async () => {
  await seedFirestore(testEnvironment, {
    "products/active-product": storedProduct("active-product"),
    "products/inactive-product": storedProduct("inactive-product", { active: false })
  });
  const database = unauthenticatedDatabase();

  const snapshot = await assertSucceeds(getDoc(doc(database, "products/active-product")));
  assert.equal(snapshot.data().priceCents, 8990);
  await assertFails(getDoc(doc(database, "products/inactive-product")));
  await assertFails(getDocs(collection(database, "products")));
});

test("visitante cria solicitação de adoção estritamente válida", async () => {
  await seedFirestore(testEnvironment, {
    "animals/animal-one": storedAnimal("animal-one")
  });
  const database = unauthenticatedDatabase();

  await assertSucceeds(
    setDoc(doc(database, "adoptionRequests/request-valid"), writableAdoption())
  );
});

test("adoção pública rejeita campos extras, estado interno e animal indisponível", async () => {
  await seedFirestore(testEnvironment, {
    "animals/animal-one": storedAnimal("animal-one"),
    "animals/unavailable-animal": storedAnimal("unavailable-animal", {
      adoptionStatus: "in_process"
    })
  });
  const database = unauthenticatedDatabase();

  await assertFails(
    setDoc(
      doc(database, "adoptionRequests/extra-field"),
      writableAdoption("animal-one", { unexpected: true })
    )
  );
  await assertFails(
    setDoc(
      doc(database, "adoptionRequests/internal-status"),
      writableAdoption("animal-one", { status: "contacting" })
    )
  );
  await assertFails(
    setDoc(
      doc(database, "adoptionRequests/missing-animal"),
      writableAdoption("missing-animal")
    )
  );
  await assertFails(
    setDoc(
      doc(database, "adoptionRequests/unavailable-animal"),
      writableAdoption("unavailable-animal")
    )
  );
  await assertFails(
    setDoc(
      doc(database, "adoptionRequests/invalid-phone"),
      writableAdoption("animal-one", { phoneE164: "123" })
    )
  );
  await assertFails(
    setDoc(
      doc(database, "adoptionRequests/client-timestamp"),
      writableAdoption("animal-one", { createdAt: FIXED_TIME })
    )
  );
  await assertFails(
    setDoc(
      doc(database, `adoptionRequests/${"a".repeat(129)}`),
      writableAdoption()
    )
  );
});

test("doação pública aceita payload válido e rejeita payloads inválidos", async () => {
  const database = unauthenticatedDatabase();

  await assertSucceeds(
    setDoc(doc(database, "donations/donation-valid"), writableDonation())
  );
  await assertFails(
    setDoc(
      doc(database, "donations/extra-field"),
      writableDonation({ unexpected: true })
    )
  );
  await assertFails(
    setDoc(
      doc(database, "donations/internal-status"),
      writableDonation({ status: "completed" })
    )
  );
  await assertFails(
    setDoc(
      doc(database, "donations/invalid-type"),
      writableDonation({ type: "pix" })
    )
  );
  await assertFails(
    setDoc(
      doc(database, "donations/public-admin-note"),
      writableDonation({ adminNotes: "texto interno" })
    )
  );
  await assertFails(
    setDoc(doc(database, "donations/id com espaço"), writableDonation())
  );
});

test("visitante não lê, altera ou exclui submissões", async () => {
  await seedFirestore(testEnvironment, {
    "adoptionRequests/request-one": storedAdoption(),
    "donations/donation-one": storedDonation()
  });
  const database = unauthenticatedDatabase();

  for (const path of ["adoptionRequests/request-one", "donations/donation-one"]) {
    const reference = doc(database, path);
    await assertFails(getDoc(reference));
    await assertFails(updateDoc(reference, { adminNotes: "tentativa pública" }));
    await assertFails(deleteDoc(reference));
  }
});

test("usuário autenticado sem registro admin não recebe privilégios", async () => {
  await seedFirestore(testEnvironment, {
    "animals/hidden-animal": storedAnimal("hidden-animal", { published: false }),
    "adoptionRequests/request-one": storedAdoption()
  });
  const database = authenticatedDatabase(NON_ADMIN_UID);

  await assertFails(getDoc(doc(database, "animals/hidden-animal")));
  await assertFails(getDoc(doc(database, "adoptionRequests/request-one")));
  await assertFails(
    setDoc(
      doc(database, "animals/non-admin-write"),
      writableAnimal("non-admin-write", NON_ADMIN_UID)
    )
  );
  await assertFails(
    setDoc(doc(database, "siteSettings/public"), settingsData(NON_ADMIN_UID))
  );
});

test("administrador inativo continua sem privilégios", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${INACTIVE_ADMIN_UID}`]: storedAdmin(INACTIVE_ADMIN_UID, false),
    "products/inactive-product": storedProduct("inactive-product", { active: false }),
    "donations/donation-one": storedDonation()
  });
  const database = authenticatedDatabase(INACTIVE_ADMIN_UID);

  await assertFails(getDoc(doc(database, "products/inactive-product")));
  await assertFails(getDoc(doc(database, "donations/donation-one")));
  await assertFails(
    setDoc(
      doc(database, "products/inactive-admin-write"),
      writableProduct("inactive-admin-write", INACTIVE_ADMIN_UID)
    )
  );
});

test("administrador ativo executa CRUD validado de animais e produtos", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${ACTIVE_ADMIN_UID}`]: storedAdmin(ACTIVE_ADMIN_UID, true)
  });
  const database = authenticatedDatabase(ACTIVE_ADMIN_UID);
  const animalReference = doc(database, "animals/admin-animal");
  const productReference = doc(database, "products/admin-product");

  await assertSucceeds(
    setDoc(animalReference, writableAnimal("admin-animal"))
  );
  await assertSucceeds(getDoc(animalReference));
  await assertSucceeds(
    updateDoc(animalReference, {
      adoptionStatus: "in_process",
      updatedAt: serverTimestamp(),
      updatedBy: ACTIVE_ADMIN_UID
    })
  );
  await assertSucceeds(
    updateDoc(animalReference, {
      adoptionStatus: "adopted",
      updatedAt: serverTimestamp(),
      updatedBy: ACTIVE_ADMIN_UID
    })
  );
  await assertFails(
    updateDoc(animalReference, {
      adoptionStatus: "in_process",
      updatedAt: serverTimestamp(),
      updatedBy: ACTIVE_ADMIN_UID
    })
  );

  await assertSucceeds(
    setDoc(productReference, writableProduct("admin-product"))
  );
  await assertSucceeds(
    updateDoc(productReference, {
      priceCents: 7990,
      updatedAt: serverTimestamp(),
      updatedBy: ACTIVE_ADMIN_UID
    })
  );
  await assertFails(
    setDoc(
      doc(database, "animals/invalid-animal"),
      writableAnimal("invalid-animal", ACTIVE_ADMIN_UID, { unexpected: true })
    )
  );

  await assertSucceeds(deleteDoc(animalReference));
  await assertSucceeds(deleteDoc(productReference));
});

test("administrador ativo trata e exclui submissões apenas por transições válidas", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${ACTIVE_ADMIN_UID}`]: storedAdmin(ACTIVE_ADMIN_UID, true),
    "adoptionRequests/request-one": storedAdoption(),
    "adoptionRequests/request-invalid-transition": storedAdoption(),
    "donations/donation-one": storedDonation()
  });
  const database = authenticatedDatabase(ACTIVE_ADMIN_UID);
  const adoptionReference = doc(database, "adoptionRequests/request-one");
  const donationReference = doc(database, "donations/donation-one");

  await assertSucceeds(getDoc(adoptionReference));
  await assertSucceeds(
    updateDoc(adoptionReference, {
      status: "contacting",
      adminNotes: "Contato iniciado.",
      handledBy: ACTIVE_ADMIN_UID,
      updatedAt: serverTimestamp()
    })
  );
  await assertSucceeds(
    updateDoc(adoptionReference, {
      status: "approved",
      adminNotes: "Adoção aprovada.",
      handledBy: ACTIVE_ADMIN_UID,
      updatedAt: serverTimestamp()
    })
  );
  await assertFails(
    updateDoc(doc(database, "adoptionRequests/request-invalid-transition"), {
      status: "approved",
      handledBy: ACTIVE_ADMIN_UID,
      updatedAt: serverTimestamp()
    })
  );

  await assertSucceeds(
    updateDoc(donationReference, {
      status: "contacting",
      adminNotes: "Retorno enviado.",
      handledBy: ACTIVE_ADMIN_UID,
      updatedAt: serverTimestamp()
    })
  );
  await assertSucceeds(
    updateDoc(donationReference, {
      status: "completed",
      adminNotes: "Doação recebida.",
      handledBy: ACTIVE_ADMIN_UID,
      updatedAt: serverTimestamp()
    })
  );

  await assertSucceeds(deleteDoc(adoptionReference));
  await assertSucceeds(deleteDoc(donationReference));
});

test("nem administrador ativo escreve a coleção admins pelo Web SDK", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${ACTIVE_ADMIN_UID}`]: storedAdmin(ACTIVE_ADMIN_UID, true),
    "admins/another-admin": storedAdmin("another-admin", true)
  });
  const database = authenticatedDatabase(ACTIVE_ADMIN_UID);

  await assertSucceeds(getDoc(doc(database, `admins/${ACTIVE_ADMIN_UID}`)));
  const listSnapshot = await assertSucceeds(getDocs(collection(database, "admins")));
  assert.equal(listSnapshot.size, 2);
  await assertFails(
    updateDoc(doc(database, `admins/${ACTIVE_ADMIN_UID}`), { active: false })
  );
  await assertFails(
    setDoc(doc(database, "admins/new-admin"), storedAdmin("new-admin", true))
  );
  await assertFails(deleteDoc(doc(database, "admins/another-admin")));
});

test("siteSettings é público para leitura e gravável somente por admin ativo", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${ACTIVE_ADMIN_UID}`]: storedAdmin(ACTIVE_ADMIN_UID, true)
  });
  const publicDatabase = unauthenticatedDatabase();
  const nonAdminDatabase = authenticatedDatabase(NON_ADMIN_UID);
  const adminDatabase = authenticatedDatabase(ACTIVE_ADMIN_UID);
  const adminReference = doc(adminDatabase, "siteSettings/public");

  await assertFails(
    setDoc(adminReference, settingsData(ACTIVE_ADMIN_UID, { whatsappDigits: "+5517999999999" }))
  );
  await assertFails(
    setDoc(doc(publicDatabase, "siteSettings/public"), settingsData())
  );
  await assertSucceeds(setDoc(adminReference, settingsData()));
  await assertSucceeds(getDoc(doc(publicDatabase, "siteSettings/public")));
  await assertFails(
    updateDoc(doc(nonAdminDatabase, "siteSettings/public"), {
      brandName: "Tentativa",
      updatedAt: serverTimestamp(),
      updatedBy: NON_ADMIN_UID
    })
  );
  await assertSucceeds(
    updateDoc(adminReference, {
      whatsappGreeting: "Olá! Quero ajudar o AuFriends.",
      updatedAt: serverTimestamp(),
      updatedBy: ACTIVE_ADMIN_UID
    })
  );
  await assertSucceeds(deleteDoc(adminReference));
});

test("default deny bloqueia coleções e subcaminhos não declarados", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${ACTIVE_ADMIN_UID}`]: storedAdmin(ACTIVE_ADMIN_UID, true),
    "unknown/document": { value: true }
  });
  const publicDatabase = unauthenticatedDatabase();
  const adminDatabase = authenticatedDatabase(ACTIVE_ADMIN_UID);

  await assertFails(getDoc(doc(publicDatabase, "unknown/document")));
  await assertFails(getDoc(doc(adminDatabase, "unknown/document")));
  await assertFails(setDoc(doc(adminDatabase, "orders/order-one"), { value: true }));
  await assertFails(
    setDoc(doc(adminDatabase, "animals/animal-one/private/note-one"), { value: true })
  );
});

test("as quatro consultas dos índices contratuais executam no emulador", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${ACTIVE_ADMIN_UID}`]: storedAdmin(ACTIVE_ADMIN_UID, true),
    "animals/animal-one": storedAnimal("animal-one"),
    "products/product-one": storedProduct("product-one"),
    "adoptionRequests/request-one": storedAdoption(),
    "donations/donation-one": storedDonation()
  });
  const publicDatabase = unauthenticatedDatabase();
  const adminDatabase = authenticatedDatabase(ACTIVE_ADMIN_UID);

  const animals = await assertSucceeds(
    getDocs(
      query(
        collection(publicDatabase, "animals"),
        where("published", "==", true),
        where("adoptionStatus", "==", "available"),
        orderBy("sortOrder", "asc")
      )
    )
  );
  const products = await assertSucceeds(
    getDocs(
      query(
        collection(publicDatabase, "products"),
        where("active", "==", true),
        orderBy("sortOrder", "asc")
      )
    )
  );
  const adoptions = await assertSucceeds(
    getDocs(
      query(
        collection(adminDatabase, "adoptionRequests"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      )
    )
  );
  const donations = await assertSucceeds(
    getDocs(
      query(
        collection(adminDatabase, "donations"),
        where("status", "==", "received"),
        orderBy("createdAt", "desc")
      )
    )
  );

  assert.deepEqual(
    [animals.size, products.size, adoptions.size, donations.size],
    [1, 1, 1, 1]
  );
});
