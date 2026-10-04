import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { Timestamp } from "firebase/firestore";
import { deleteObject, getMetadata, ref, uploadBytes } from "firebase/storage";
import {
  createStorageTestEnvironment,
  seedFirestore,
  seedStorage,
  STORAGE_BUCKET
} from "./helpers.js";

const ACTIVE_ADMIN_UID = "admin-active";
const INACTIVE_ADMIN_UID = "admin-inactive";
const NON_ADMIN_UID = "authenticated-non-admin";
const FIXED_TIME = Timestamp.fromMillis(1790985600000);
const JPEG_NAME = "123e4567-e89b-42d3-a456-426614174000.jpg";
const PNG_NAME = "123e4567-e89b-42d3-a456-426614174001.png";
const WEBP_NAME = "123e4567-e89b-42d3-a456-426614174002.webp";

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

function bytes(size = 4) {
  return new Uint8Array(size).fill(1);
}

function storageFor(context) {
  return context.storage(STORAGE_BUCKET);
}

function unauthenticatedStorage() {
  return storageFor(testEnvironment.unauthenticatedContext());
}

function authenticatedStorage(uid) {
  return storageFor(
    testEnvironment.authenticatedContext(uid, {
      email: `${uid}@aufriends.local`
    })
  );
}

before(async () => {
  testEnvironment = await createStorageTestEnvironment();
});

beforeEach(async () => {
  await Promise.all([
    testEnvironment.clearFirestore(),
    testEnvironment.clearStorage()
  ]);
});

after(async () => {
  if (testEnvironment) {
    await Promise.all([
      testEnvironment.clearFirestore(),
      testEnvironment.clearStorage()
    ]);
    await testEnvironment.cleanup();
  }
});

test("visitante lê somente imagens nas duas pastas públicas de catálogo", async () => {
  await seedStorage(testEnvironment, [
    {
      path: `public/animals/animal-one/${JPEG_NAME}`,
      data: bytes(),
      contentType: "image/jpeg"
    },
    {
      path: `public/products/product-one/${WEBP_NAME}`,
      data: bytes(),
      contentType: "image/webp"
    },
    {
      path: `private/internal/${PNG_NAME}`,
      data: bytes(),
      contentType: "image/png"
    },
    {
      path: "public/animals/animal-one/not-generated.webp",
      data: bytes(),
      contentType: "image/webp"
    }
  ]);
  const storage = unauthenticatedStorage();

  const animalMetadata = await assertSucceeds(
    getMetadata(ref(storage, `public/animals/animal-one/${JPEG_NAME}`))
  );
  const productMetadata = await assertSucceeds(
    getMetadata(ref(storage, `public/products/product-one/${WEBP_NAME}`))
  );
  assert.equal(animalMetadata.contentType, "image/jpeg");
  assert.equal(productMetadata.contentType, "image/webp");
  await assertFails(getMetadata(ref(storage, `private/internal/${PNG_NAME}`)));
  await assertFails(
    getMetadata(ref(storage, "public/animals/animal-one/not-generated.webp"))
  );
});

test("visitante, não administrador e administrador inativo não enviam arquivos", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${INACTIVE_ADMIN_UID}`]: storedAdmin(INACTIVE_ADMIN_UID, false)
  });
  const path = `public/animals/animal-one/${JPEG_NAME}`;

  await assertFails(
    uploadBytes(ref(unauthenticatedStorage(), path), bytes(), { contentType: "image/jpeg" })
  );
  await assertFails(
    uploadBytes(ref(authenticatedStorage(NON_ADMIN_UID), path), bytes(), {
      contentType: "image/jpeg"
    })
  );
  await assertFails(
    uploadBytes(ref(authenticatedStorage(INACTIVE_ADMIN_UID), path), bytes(), {
      contentType: "image/jpeg"
    })
  );
});

test("administrador ativo envia JPEG, PNG e WebP válidos e o público os lê", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${ACTIVE_ADMIN_UID}`]: storedAdmin(ACTIVE_ADMIN_UID, true)
  });
  const adminStorage = authenticatedStorage(ACTIVE_ADMIN_UID);
  const publicStorage = unauthenticatedStorage();
  const uploads = [
    [`public/animals/animal-one/${JPEG_NAME}`, "image/jpeg"],
    [`public/animals/animal-one/${PNG_NAME}`, "image/png"],
    [`public/products/product-one/${WEBP_NAME}`, "image/webp"]
  ];

  for (const [path, contentType] of uploads) {
    await assertSucceeds(
      uploadBytes(ref(adminStorage, path), bytes(), { contentType })
    );
    const metadata = await assertSucceeds(getMetadata(ref(publicStorage, path)));
    assert.equal(metadata.contentType, contentType);
  }
});

test("upload administrativo rejeita MIME, nome e tamanho inválidos", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${ACTIVE_ADMIN_UID}`]: storedAdmin(ACTIVE_ADMIN_UID, true)
  });
  const storage = authenticatedStorage(ACTIVE_ADMIN_UID);

  await assertFails(
    uploadBytes(
      ref(storage, `public/animals/animal-one/${WEBP_NAME}`),
      bytes(),
      { contentType: "image/svg+xml" }
    )
  );
  await assertFails(
    uploadBytes(
      ref(storage, "public/animals/animal-one/not-a-uuid.webp"),
      bytes(),
      { contentType: "image/webp" }
    )
  );
  await assertFails(
    uploadBytes(
      ref(storage, `public/products/product-one/${WEBP_NAME}`),
      bytes(5 * 1024 * 1024 + 1),
      { contentType: "image/webp" }
    )
  );
  await assertFails(
    uploadBytes(
      ref(storage, `public/products/product-one/${PNG_NAME}`),
      bytes(0),
      { contentType: "image/png" }
    )
  );
});

test("atualização de arquivo reaplica tipo e limite", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${ACTIVE_ADMIN_UID}`]: storedAdmin(ACTIVE_ADMIN_UID, true)
  });
  const storage = authenticatedStorage(ACTIVE_ADMIN_UID);
  const imageReference = ref(storage, `public/animals/animal-one/${JPEG_NAME}`);

  await assertSucceeds(
    uploadBytes(imageReference, bytes(), { contentType: "image/jpeg" })
  );
  await assertFails(
    uploadBytes(imageReference, bytes(), { contentType: "application/octet-stream" })
  );
  await assertSucceeds(
    uploadBytes(imageReference, bytes(8), { contentType: "image/jpeg" })
  );
});

test("somente administrador ativo exclui mídia de catálogo", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${ACTIVE_ADMIN_UID}`]: storedAdmin(ACTIVE_ADMIN_UID, true),
    [`admins/${INACTIVE_ADMIN_UID}`]: storedAdmin(INACTIVE_ADMIN_UID, false)
  });
  const path = `public/products/product-one/${WEBP_NAME}`;
  await seedStorage(testEnvironment, [
    { path, data: bytes(), contentType: "image/webp" }
  ]);

  await assertFails(deleteObject(ref(unauthenticatedStorage(), path)));
  await assertFails(deleteObject(ref(authenticatedStorage(INACTIVE_ADMIN_UID), path)));
  await assertSucceeds(deleteObject(ref(authenticatedStorage(ACTIVE_ADMIN_UID), path)));
});

test("default deny bloqueia caminhos desconhecidos até para administrador ativo", async () => {
  await seedFirestore(testEnvironment, {
    [`admins/${ACTIVE_ADMIN_UID}`]: storedAdmin(ACTIVE_ADMIN_UID, true)
  });
  const storage = authenticatedStorage(ACTIVE_ADMIN_UID);

  await assertFails(
    uploadBytes(ref(storage, `private/animals/animal-one/${WEBP_NAME}`), bytes(), {
      contentType: "image/webp"
    })
  );
  await assertFails(
    uploadBytes(
      ref(storage, `public/animals/animal-one/nested/${WEBP_NAME}`),
      bytes(),
      { contentType: "image/webp" }
    )
  );
});
