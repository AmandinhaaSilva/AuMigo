import { firebaseClient } from "../config/firebase-client.js";
import {
  allowedDonationStatuses,
  createDonationsDataService,
  donationDataErrorMessage
} from "../services/donations-data.js";

const service = createDonationsDataService(firebaseClient.firestore);
const status = document.querySelector("[data-admin-donations-status]");
const list = document.querySelector("[data-admin-donations-list]");
const filter = document.querySelector("[data-donation-filter]");
const refresh = document.querySelector("[data-donations-refresh]");
const labels = Object.freeze({
  status: Object.freeze({ received: "Recebida", contacting: "Em contato", completed: "Concluída" }),
  type: Object.freeze({
    money: "Dinheiro",
    food: "Ração e alimentos",
    hygiene: "Produtos de higiene",
    clothing: "Roupinhas",
    blanket: "Cobertores",
    other: "Outros"
  }),
  delivery: Object.freeze({
    dropoff: "Entregar no local",
    pickup: "Solicitar retirada",
    arrange: "A combinar"
  })
});

let initialized = false;
let activeUser;

function node(name, className, content) {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function setStatus(message, kind = "info") {
  status.textContent = message;
  status.setAttribute("role", kind === "error" ? "alert" : "status");
  status.classList.toggle("placeholder-note--error", kind === "error");
  status.classList.toggle("placeholder-note--success", kind === "success");
}

function notifyMetricRefresh() {
  document.dispatchEvent(new CustomEvent("aufriends:metrics-refresh"));
}

function formattedDate(value) {
  try {
    return value?.toDate?.().toLocaleString("pt-BR") ?? "Data indisponível";
  } catch {
    return "Data indisponível";
  }
}

function field(term, value) {
  const wrapper = node("div");
  wrapper.append(node("dt", null, term), node("dd", null, value || "Não informado"));
  return wrapper;
}

function replaceStatusOptions(select, donation) {
  select.replaceChildren(...allowedDonationStatuses(donation.status).map((value) => {
    const option = node("option", null, labels.status[value] ?? value);
    option.value = value;
    option.selected = value === donation.status;
    return option;
  }));
}

async function runAction(card, message, successMessage, action) {
  card.setAttribute("aria-busy", "true");
  setStatus(message);
  try {
    await action();
    await loadDonations();
    notifyMetricRefresh();
    setStatus(successMessage, "success");
  } catch (error) {
    card.setAttribute("aria-busy", "false");
    setStatus(donationDataErrorMessage(error, "save"), "error");
  }
}

function donationCard(donation) {
  const card = node("details", "admin-request-card");
  const summary = node("summary");
  summary.append(
    node("strong", null, donation.fullName),
    node("span", null, `${labels.type[donation.type] ?? donation.type} • ${labels.status[donation.status] ?? donation.status}`)
  );

  const content = node("div", "admin-request-card__content");
  const fields = node("dl", "admin-request-fields");
  fields.append(
    field("E-mail", donation.email),
    field("Telefone", donation.phoneE164),
    field("Tipo", labels.type[donation.type] ?? donation.type),
    field("Quantidade ou valor", donation.amountOrQuantity),
    field("Forma de entrega", labels.delivery[donation.deliveryMethod] ?? donation.deliveryMethod),
    field("Recebida em", formattedDate(donation.createdAt)),
    field("Mensagem", donation.message || "Sem mensagem")
  );

  const statusField = node("div", "form-field");
  const statusLabel = node("label", null, "Status");
  const statusSelect = node("select");
  statusSelect.id = `donation-status-${donation.id}`;
  statusLabel.htmlFor = statusSelect.id;
  replaceStatusOptions(statusSelect, donation);
  statusField.append(statusLabel, statusSelect);

  const notesField = node("div", "form-field admin-request-notes");
  const notesLabel = node("label", null, "Observações administrativas");
  const notes = node("textarea");
  notes.id = `donation-notes-${donation.id}`;
  notesLabel.htmlFor = notes.id;
  notes.rows = 4;
  notes.maxLength = 2_000;
  notes.value = donation.adminNotes;
  notesField.append(notesLabel, notes);

  const actions = node("div", "admin-resource-actions");
  const save = node("button", "button button--compact", "Salvar tratamento");
  save.type = "button";
  save.addEventListener("click", () => runAction(
    card,
    "Salvando o tratamento da doação…",
    "Doação atualizada com sucesso.",
    () => service.updateDonation(activeUser.uid, donation, {
      status: statusSelect.value,
      adminNotes: notes.value
    })
  ));

  const remove = node("button", "button button--compact admin-button--danger", "Excluir doação");
  remove.type = "button";
  remove.addEventListener("click", () => {
    if (!window.confirm(`Excluir definitivamente a intenção de doação de ${donation.fullName}?`)) return;
    void runAction(
      card,
      "Excluindo a doação…",
      "Doação excluída com sucesso.",
      () => service.deleteDonation(activeUser.uid, donation.id)
    );
  });

  actions.append(save, remove);
  content.append(fields, statusField, notesField, actions);
  card.append(summary, content);
  return card;
}

async function loadDonations() {
  refresh.disabled = true;
  list.setAttribute("aria-busy", "true");
  setStatus("Carregando doações…");
  try {
    const donations = await service.listAdminDonations(filter.value);
    list.replaceChildren(...donations.map(donationCard));
    list.setAttribute("aria-busy", "false");
    setStatus(
      donations.length === 0
        ? "Nenhuma doação neste filtro."
        : `${donations.length} ${donations.length === 1 ? "doação encontrada" : "doações encontradas"}.`
    );
  } catch (error) {
    list.setAttribute("aria-busy", "false");
    setStatus(donationDataErrorMessage(error), "error");
  } finally {
    refresh.disabled = false;
  }
}

export async function initializeAdminDonations(user) {
  if (initialized) return;
  if (!user?.uid) throw new TypeError("Sessão administrativa obrigatória.");
  initialized = true;
  activeUser = user;
  filter.addEventListener("change", loadDonations);
  refresh.addEventListener("click", loadDonations);
  await loadDonations();
}
