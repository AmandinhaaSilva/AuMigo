import { applyAdminAuthFixture } from "./fixtures/admin-auth.mjs";
import { applyAdoptionsFixture } from "./fixtures/adoptions-t09.mjs";
import {
  LOCAL_HOST,
  LOCAL_PROJECT_ID,
  preflightLocalEmulators
} from "./fixtures/local-emulator-environment.mjs";
import { applyProductsFixture } from "./fixtures/products-t11.mjs";
import { applySiteSettingsFixture } from "./fixtures/site-settings.mjs";

const preflight = await preflightLocalEmulators();
console.log(
  `Preflight confirmado: ${preflight.projectId}; Auth ${LOCAL_HOST}:${preflight.ports.auth}; Firestore ${LOCAL_HOST}:${preflight.ports.firestore}; Storage ${LOCAL_HOST}:${preflight.ports.storage}; Hub ${LOCAL_HOST}:${preflight.ports.hub}.`
);

await applyAdminAuthFixture({
  preflight,
  removeKnownNonAdminAuthorization: false,
  deactivateKnownNonAdminAuthorization: true,
  quiet: true
});
await applySiteSettingsFixture({ preflight, quiet: true });
const animals = await applyAdoptionsFixture({
  preflight,
  removePreviousMedia: false,
  quiet: true
});
const products = await applyProductsFixture({
  preflight,
  removePreviousMedia: false,
  quiet: true
});

console.log(
  `Seed local concluído em ${LOCAL_PROJECT_ID}: 2 contas Auth, administrador baseline ativo, siteSettings/public, ${animals.ids.length} animais e ${products.ids.length} produtos.`
);
console.log(
  `Mídias fixas confirmadas para upload: ${animals.imagePaths.length + products.imagePaths.length}. O comando não cria nem apaga submissões e não remove documentos desconhecidos.`
);
