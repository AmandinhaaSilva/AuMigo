import { firebaseClient } from "../config/firebase-client.js";
import { createAdoptionsDataService } from "./adoptions-data.js";
import { createProductsDataService } from "./products-data.js";
import integrante1 from "../../assets/img/integrante-1.webp";
import integrante2 from "../../assets/img/integrante-2.webp";
import integrante3 from "../../assets/img/integrante-3.webp";
import integrante4 from "../../assets/img/integrante-4.webp";
import integrante5 from "../../assets/img/integrante-5.webp";
import integrante6 from "../../assets/img/integrante-6.webp";
import sobre1 from "../../assets/img/sobre-1.webp";
import sobre2 from "../../assets/img/sobre-2.webp";
import sobre3 from "../../assets/img/sobre-3.webp";
import sobre4 from "../../assets/img/sobre-4.webp";
import sobre5 from "../../assets/img/sobre-5.webp";
import sobre6 from "../../assets/img/sobre-6.webp";

const PRELOAD_MARKER = "aufriends:site-images:warmed:v1";
const STATIC_ROUTE_IMAGES = Object.freeze([
  sobre1,
  sobre2,
  sobre3,
  sobre4,
  sobre5,
  sobre6,
  integrante1,
  integrante2,
  integrante3,
  integrante4,
  integrante5,
  integrante6
]);

function warmImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "low";
    image.addEventListener("load", () => resolve(true), { once: true });
    image.addEventListener("error", () => resolve(false), { once: true });
    image.src = url;
  });
}

async function catalogImageUrls() {
  const adoptions = createAdoptionsDataService(firebaseClient.firestore, firebaseClient.media);
  const products = createProductsDataService(firebaseClient.firestore, firebaseClient.media);
  const [animalsResult, productsResult] = await Promise.allSettled([
    adoptions.listPublicAnimals(),
    products.listPublicProducts()
  ]);
  const records = [animalsResult, productsResult]
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);
  return records.map((record) => record.imageUrl).filter(Boolean);
}

export async function preloadSiteImages() {
  if (sessionStorage.getItem(PRELOAD_MARKER) === "complete") return;

  const remoteUrls = await catalogImageUrls().catch(() => []);
  const urls = [...new Set([...STATIC_ROUTE_IMAGES, ...remoteUrls])];
  const outcomes = await Promise.all(urls.map(warmImage));

  if (outcomes.some(Boolean)) {
    sessionStorage.setItem(PRELOAD_MARKER, "complete");
  }
}
