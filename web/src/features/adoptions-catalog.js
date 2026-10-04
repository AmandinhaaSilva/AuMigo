import { firebaseClient } from "../config/firebase-client.js";
import {
  adoptionDataErrorMessage,
  animalArticle,
  createAdoptionsDataService,
  filterPublicAnimals,
  formatAnimalAge
} from "../services/adoptions-data.js";

const service = createAdoptionsDataService(firebaseClient.firestore, firebaseClient.media);
const filtersForm = document.querySelector("[data-animal-filters]");
const grid = document.querySelector("[data-animal-grid]");
const status = document.querySelector("[data-animal-status]");
const retry = document.querySelector("[data-animal-retry]");
const labels = Object.freeze({
  sex: Object.freeze({ female: "Fêmea", male: "Macho" }),
  size: Object.freeze({ small: "Pequeno", medium: "Médio", large: "Grande" })
});

let animals = [];

function element(name, className, text) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cardFor(animal, index) {
  const article = element("article", "animal-card");
  const media = element("div", "animal-card__media");

  if (animal.imageUrl) {
    const image = element("img");
    image.src = animal.imageUrl;
    image.alt = animal.imageAlt;
    image.loading = index < 4 ? "eager" : "lazy";
    image.decoding = "async";
    image.fetchPriority = index < 2 ? "high" : "auto";
    image.addEventListener("error", () => {
      image.remove();
      media.append(element("span", "animal-media-placeholder", "Imagem indisponível"));
    }, { once: true });
    media.append(image);
  } else {
    media.append(element("span", "animal-media-placeholder", "Imagem indisponível"));
  }

  const heading = element("h2", null, `Adote ${animalArticle(animal)} ${animal.name}`);
  const facts = element("div", "animal-card__facts");
  facts.append(
    element("p", null, labels.sex[animal.sex] ?? "Sexo não informado"),
    element("p", null, `Porte ${labels.size[animal.size]?.toLowerCase() ?? "não informado"}`),
    element("p", null, formatAnimalAge(animal.ageMonths))
  );
  const link = element("a", "button", "Conheça minha história");
  link.href = `/adocoes/detalhe?animal=${encodeURIComponent(animal.id)}`;
  link.setAttribute("aria-label", `Conheça a história de ${animal.name}`);
  article.append(media, heading, facts, link);
  return article;
}

function selectedFilters() {
  const data = new FormData(filtersForm);
  return {
    sex: data.get("sex") ?? "all",
    size: data.get("size") ?? "all",
    age: data.get("age") ?? "all"
  };
}

function renderAnimals() {
  const visible = filterPublicAnimals(animals, selectedFilters());
  grid.replaceChildren(...visible.map(cardFor));
  grid.setAttribute("aria-busy", "false");
  status.setAttribute("role", "status");

  if (animals.length === 0) {
    status.textContent = "Nenhum animal está publicado e disponível no momento.";
  } else if (visible.length === 0) {
    status.textContent = "Nenhum animal corresponde aos filtros selecionados.";
  } else {
    status.textContent = `${visible.length} ${visible.length === 1 ? "animal disponível" : "animais disponíveis"}.`;
  }
}

async function loadAnimals() {
  retry.hidden = true;
  grid.setAttribute("aria-busy", "true");
  grid.replaceChildren();
  status.textContent = "Carregando animais disponíveis…";
  status.setAttribute("role", "status");
  filtersForm.setAttribute("aria-busy", "true");

  try {
    animals = await service.listPublicAnimals();
    renderAnimals();
  } catch (error) {
    animals = [];
    grid.setAttribute("aria-busy", "false");
    status.textContent = adoptionDataErrorMessage(error);
    status.setAttribute("role", "alert");
    retry.hidden = false;
  } finally {
    filtersForm.setAttribute("aria-busy", "false");
  }
}

filtersForm.addEventListener("input", renderAnimals);
filtersForm.addEventListener("reset", () => window.setTimeout(renderAnimals, 0));
retry.addEventListener("click", loadAnimals);
void loadAnimals();
