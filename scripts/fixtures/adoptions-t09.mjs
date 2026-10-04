import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

export const T09_ANIMALS = Object.freeze([
  Object.freeze({
    id: "t09-luna",
    imageFile: "luna.png",
    imageType: "image/png",
    imagePath: "public/animals/t09-luna/10000000-0000-4000-8000-000000000001.png",
    name: "Luna",
    species: "dog",
    breed: "Sem raça definida",
    ageMonths: 10,
    sex: "female",
    size: "small",
    color: "Caramelo",
    description: "Luna é carinhosa, curiosa e procura uma família paciente para continuar descobrindo o mundo com segurança.",
    sortOrder: 10,
    imageAlt: "Luna, cachorrinha de porte pequeno"
  }),
  Object.freeze({
    id: "t09-thor",
    imageFile: "thor.png",
    imageType: "image/png",
    imagePath: "public/animals/t09-thor/20000000-0000-4000-8000-000000000002.png",
    name: "Thor",
    species: "dog",
    breed: "Sem raça definida",
    ageMonths: 30,
    sex: "male",
    size: "medium",
    color: "Marrom",
    description: "Thor gosta de passeios e companhia. Ele está pronto para construir uma rotina afetuosa com uma família responsável.",
    sortOrder: 20,
    imageAlt: "Thor, cachorro de porte médio"
  }),
  Object.freeze({
    id: "t09-jade",
    imageFile: "jade.png",
    imageType: "image/png",
    imagePath: "public/animals/t09-jade/30000000-0000-4000-8000-000000000003.png",
    name: "Jade",
    species: "dog",
    breed: "Sem raça definida",
    ageMonths: 84,
    sex: "female",
    size: "large",
    color: "Preta e branca",
    description: "Jade é tranquila e companheira. Busca um lar acolhedor para viver sua fase madura com conforto e carinho.",
    sortOrder: 30,
    imageAlt: "Jade, cachorrinha de porte grande"
  })
]);

export async function applyAdoptionsFixture({
  preflight,
  removePreviousMedia = true,
  quiet = false
} = {}) {
  await resolveLocalPreflight(preflight);
  const app = initializeApp(
    LOCAL_FIREBASE_CONFIG,
    `t09-adoptions-fixture-${crypto.randomUUID()}`
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

    for (const animal of T09_ANIMALS) {
      const documentReference = doc(firestore, "animals", animal.id);
      const current = await getDocFromServer(documentReference);
      const previousPath = current.exists() ? current.get("imagePath") : null;
      const currentCreatedAt = current.exists() ? current.get("createdAt") : null;
      const image = await readFile(resolve(projectRoot, "web/assets/img", animal.imageFile));

      await uploadBytes(ref(storage, animal.imagePath), image, { contentType: animal.imageType });
      try {
        await setDoc(documentReference, {
          schemaVersion: 1,
          name: animal.name,
          species: animal.species,
          breed: animal.breed,
          ageMonths: animal.ageMonths,
          sex: animal.sex,
          size: animal.size,
          color: animal.color,
          description: animal.description,
          adoptionStatus: "available",
          published: true,
          sortOrder: animal.sortOrder,
          imagePath: animal.imagePath,
          imageAlt: animal.imageAlt,
          createdAt: currentCreatedAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: credential.user.uid
        }, { merge: false });
      } catch (error) {
        if (previousPath !== animal.imagePath) {
          await deleteObject(ref(storage, animal.imagePath)).catch(() => {});
        }
        throw error;
      }

      if (removePreviousMedia && previousPath && previousPath !== animal.imagePath) {
        await deleteObject(ref(storage, previousPath)).catch((error) => {
          if (error?.code !== "storage/object-not-found") throw error;
        });
      }
    }

    if (!quiet) {
      console.log(
        `Fixture T09 aplicada em ${LOCAL_PROJECT_ID}: ${T09_ANIMALS.length} animais publicados e nenhuma solicitação pessoal.`
      );
      console.log("A fixture é local, idempotente, usa os assets existentes e não lê SQL.");
    }
    return Object.freeze({
      ids: Object.freeze(T09_ANIMALS.map(({ id }) => id)),
      imagePaths: Object.freeze(T09_ANIMALS.map(({ imagePath }) => imagePath))
    });
  } finally {
    await signOut(auth).catch(() => {});
    await deleteApp(app);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await applyAdoptionsFixture();
}
